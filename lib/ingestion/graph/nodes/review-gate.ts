import { interrupt } from '@langchain/langgraph';

import type { ChunkContract } from '../../contracts/chunk';
import type { ReviewResolutionType } from '../../contracts/review';
import { diffChunkMetadata, type ChunkMetadataPatch } from '../../services/diffing';
import { getReviewTaskScopeRef } from '../../services/review-routing';
import { ingestionStorage } from '../../storage/repositories';
import type { IngestionStorage, ReviewTaskResolutionRecord } from '../../storage/types';
import type { IngestionState } from '../state';

type EditChunkMetadata = ChunkMetadataPatch;

type ReviewDecision =
  | { action: 'approve_document' }
  | { action: 'reject_document' }
  | { action: 'approve_chunks'; chunkIds: string[] }
  | { action: 'reject_chunks'; chunkIds: string[] }
  | {
      action: 'edit_chunk_metadata';
      chunkId?: string;
      metadata?: EditChunkMetadata;
      edits?: Array<{ chunkId: string; metadata: EditChunkMetadata }>;
    };

function buildResolutionJson(decision: ReviewDecision) {
  return JSON.parse(JSON.stringify(decision)) as Record<string, unknown>;
}

function getResolutionType(decision: ReviewDecision): ReviewResolutionType {
  switch (decision.action) {
    case 'edit_chunk_metadata':
      return 'edited';
    case 'reject_document':
    case 'reject_chunks':
      return 'rejected';
    case 'approve_document':
    case 'approve_chunks':
      return 'approved';
  }
}

function resolveTasks(
  state: IngestionState,
  matcher: (scopeRefId: string) => boolean,
  decision: ReviewDecision,
  resolutionJson: Record<string, unknown>
) {
  const resolved: ReviewTaskResolutionRecord[] = [];
  const resolutionType = getResolutionType(decision);
  const resolvedAt = new Date().toISOString();
  const reviewTasks = (state.reviewTasks ?? []).map((task) => {
    const scopeRefId = getReviewTaskScopeRef(task);
    if (!scopeRefId || !matcher(scopeRefId)) {
      return task;
    }

    resolved.push({
      reviewTaskId: task.reviewTaskId,
      status: 'resolved',
      resolutionType,
      resolutionJson,
      resolvedAt,
    });

    return {
      ...task,
      status: 'resolved' as const,
      resolutionType,
      resolutionJson,
      resolvedAt,
    };
  });

  return {
    resolved,
    reviewTasks,
  };
}

function applyChunkMetadataEdits(
  chunks: ChunkContract[],
  edits: Array<{ chunkId: string; metadata: EditChunkMetadata }>
) {
  const editsByChunkId = new Map(edits.map((edit) => [edit.chunkId, edit.metadata]));
  const diffs: Array<{
    chunkId: string;
    changes: Array<{ field: string; before: unknown; after: unknown }>;
    requiresReindex: boolean;
  }> = [];

  const nextChunks = chunks.map((chunk) => {
    const metadata = editsByChunkId.get(chunk.chunkId);
    if (!metadata) {
      return chunk;
    }

    const diff = diffChunkMetadata(chunk, metadata);
    diffs.push({
      chunkId: chunk.chunkId,
      changes: diff.changes.map((change) => ({
        field: String(change.field),
        before: change.before,
        after: change.after,
      })),
      requiresReindex: diff.requiresReindex,
    });

    return {
      ...diff.after,
      reviewStatus: chunk.reviewStatus === 'review_required' ? 'approved' : chunk.reviewStatus,
      indexStatus: diff.requiresReindex ? 'reindex_required' : chunk.indexStatus,
      metadataVersion: metadata.metadataVersion ?? chunk.metadataVersion + 1,
    };
  });

  return {
    chunks: nextChunks,
    diffs,
  };
}

export function createReviewGateNode(storage: IngestionStorage = ingestionStorage) {
  return async function reviewGateNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    if (!state.reviewTasks?.length) {
      return { status: 'VALIDATED' };
    }

    const decision = interrupt({
      ingestionId: state.ingestionId,
      documentId: state.documentId,
      issues: state.validationIssues,
      reviewTasks: state.reviewTasks,
      candidateChunks: state.chunks,
    }) as ReviewDecision;

    let resolutionJson = buildResolutionJson(decision);
    let nextChunks = state.chunks ?? [];
    let nextReviewTasks = state.reviewTasks ?? [];
    let resolvedTasks: ReviewTaskResolutionRecord[] = [];

    if (decision.action === 'approve_document') {
      const resolved = resolveTasks(state, () => true, decision, resolutionJson);
      resolvedTasks = resolved.resolved;
      nextReviewTasks = resolved.reviewTasks;
      nextChunks = nextChunks.map((chunk) => ({
        ...chunk,
        reviewStatus: chunk.reviewStatus === 'review_required' ? 'approved' : chunk.reviewStatus,
      }));
    } else if (decision.action === 'reject_document') {
      const resolved = resolveTasks(state, () => true, decision, resolutionJson);
      resolvedTasks = resolved.resolved;
      nextReviewTasks = resolved.reviewTasks;
      nextChunks = nextChunks.map((chunk) => ({
        ...chunk,
        reviewStatus: 'rejected',
      }));
    } else if (decision.action === 'approve_chunks') {
      const chunkIds = new Set(decision.chunkIds);
      const resolved = resolveTasks(
        state,
        (scopeRefId) => chunkIds.has(scopeRefId),
        decision,
        resolutionJson
      );
      resolvedTasks = resolved.resolved;
      nextReviewTasks = resolved.reviewTasks;
      nextChunks = nextChunks.map((chunk) => ({
        ...chunk,
        reviewStatus:
          chunkIds.has(chunk.chunkId) && chunk.reviewStatus === 'review_required'
            ? 'approved'
            : chunk.reviewStatus,
      }));
    } else if (decision.action === 'reject_chunks') {
      const chunkIds = new Set(decision.chunkIds);
      const resolved = resolveTasks(
        state,
        (scopeRefId) => chunkIds.has(scopeRefId),
        decision,
        resolutionJson
      );
      resolvedTasks = resolved.resolved;
      nextReviewTasks = resolved.reviewTasks;
      nextChunks = nextChunks.map((chunk) => ({
        ...chunk,
        reviewStatus: chunkIds.has(chunk.chunkId) ? 'rejected' : chunk.reviewStatus,
      }));
    } else {
      const edits =
        decision.edits ??
        (decision.chunkId && decision.metadata
          ? [{ chunkId: decision.chunkId, metadata: decision.metadata }]
          : []);
      const chunkIds = new Set(edits.map((edit) => edit.chunkId));
      const editResult = applyChunkMetadataEdits(nextChunks, edits);
      resolutionJson = {
        ...resolutionJson,
        diffs: editResult.diffs,
      };
      const resolved = resolveTasks(
        state,
        (scopeRefId) => chunkIds.has(scopeRefId),
        decision,
        resolutionJson
      );
      resolvedTasks = resolved.resolved;
      nextReviewTasks = resolved.reviewTasks;
      nextChunks = editResult.chunks;
    }

    if (resolvedTasks.length > 0) {
      await storage.resolveReviewTasks?.(resolvedTasks);
    }

    const pendingReviewTasks = nextReviewTasks.filter((task) => task.status !== 'resolved');
    if (pendingReviewTasks.length > 0) {
      interrupt({
        ingestionId: state.ingestionId,
        documentId: state.documentId,
        issues: state.validationIssues,
        reviewTasks: pendingReviewTasks,
        candidateChunks: nextChunks,
      });
    }

    return {
      status: decision.action === 'reject_document' ? 'REJECTED' : 'VALIDATED',
      chunks: nextChunks,
      reviewTasks: nextReviewTasks,
    };
  };
}

export const reviewGateNode = createReviewGateNode();

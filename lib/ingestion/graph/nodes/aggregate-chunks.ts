import { runChunkWorker } from '../workers/chunk-worker';
import { randomUUID } from 'node:crypto';

import type { IngestionState } from '../state';
import type { ReviewTaskContract } from '../../contracts/review';

function buildPreEnrichmentReviewTasks(state: IngestionState): ReviewTaskContract[] {
  const reasonCodes: string[] = [];
  const chunkCount = state.chunks?.length ?? 0;

  if (state.chunkStrategyConfidence === 'low') {
    reasonCodes.push('LOW_STRATEGY_CONFIDENCE');
  }

  if (!state.rowBatchPlan && (state.chunkTasks?.length ?? 0) === 0 && chunkCount === 0) {
    reasonCodes.push('EMPTY_CHUNK_PLAN');
  }

  if (reasonCodes.length === 0) {
    return [];
  }

  return [
    {
      reviewTaskId: randomUUID(),
      ingestionId: state.ingestionId,
      documentId: state.documentId,
      taskType: 'strategy_review',
      reasonCodes,
      targetDocumentId: state.documentId,
      targetChunkIds: [],
      scope: 'document',
      scopeRefId: state.documentId,
      reasonCode: reasonCodes[0],
      summary:
        state.chunkStrategyConfidence === 'low'
          ? `Chunk strategy ${state.chunkingStrategy ?? state.initialChunkingHypothesis ?? 'section'} has low confidence and requires review before enrichment.`
          : 'No chunk candidates were produced for the selected chunking strategy.',
      suggestedAction: 'edit',
      status: 'pending',
    },
  ];
}

export async function aggregateChunksNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const chunks =
    state.chunks && state.chunks.length > 0
      ? state.chunks
      : await Promise.all((state.chunkTasks ?? []).map((task) => runChunkWorker(task)));
  const reviewTasks = buildPreEnrichmentReviewTasks(state);

  return {
    chunks,
    reviewTasks,
    status: reviewTasks.length > 0 ? 'REVIEW_REQUIRED' : 'CHUNKED',
    metrics: {
      ...state.metrics,
      totalChunks: state.rowBatchProgress
        ? state.rowBatchProgress.processedChunks + chunks.length
        : chunks.length,
    },
  };
}

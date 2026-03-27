import { randomUUID } from 'node:crypto';

import type { ChunkContract } from '../contracts/chunk';
import type { ReviewTaskContract, ValidationIssueContract } from '../contracts/review';
import type { IngestionDecisionProvider } from './llm-decision-provider';

export type ReviewTaskRoutingInput = {
  ingestionId: string;
  documentId: string;
  issue: ValidationIssueContract;
  chunk?: ChunkContract;
};

export function buildReviewTaskFromValidationIssueDeterministic(
  input: ReviewTaskRoutingInput
): ReviewTaskContract {
  const { ingestionId, documentId, issue } = input;
  return {
    reviewTaskId: randomUUID(),
    ingestionId,
    documentId,
    taskType: issue.chunkId ? 'chunk_review' : 'document_review',
    reasonCodes: [issue.code],
    targetDocumentId: documentId,
    targetChunkIds: issue.chunkId ? [issue.chunkId] : [],
    scope: issue.chunkId ? 'chunk' : 'document',
    scopeRefId: issue.chunkId ?? documentId,
    reasonCode: issue.code,
    summary: issue.message,
    suggestedAction: 'approve',
    status: 'pending',
  };
}

export async function buildReviewTaskFromValidationIssue(
  input: ReviewTaskRoutingInput,
  options?: {
    provider?: Pick<IngestionDecisionProvider, 'routeReviewTask'>;
  }
): Promise<ReviewTaskContract> {
  const deterministic = buildReviewTaskFromValidationIssueDeterministic(input);
  if (!options?.provider?.routeReviewTask) {
    throw new Error('LLM decision provider is required for review routing');
  }

  const decision = await options.provider.routeReviewTask(input);
  if (!decision) {
    throw new Error('LLM review routing returned no decision');
  }

  return {
    ...deterministic,
    ...decision,
    taskType: decision.taskType,
    reasonCodes: decision.reasonCodes,
    reasonCode: decision.reasonCodes[0] ?? deterministic.reasonCode,
    summary: decision.summary,
    suggestedAction: decision.suggestedAction,
    assignee: decision.assignee,
    owner: decision.owner,
  };
}

export function getReviewTaskScopeRef(task: ReviewTaskContract): string | undefined {
  return task.scopeRefId ?? task.targetChunkIds?.[0] ?? task.targetDocumentId;
}

import { buildReviewTaskFromValidationIssue } from '../../services/review-routing';
import { validateChunks } from '../../services/validation';
import type { IngestionDecisionProvider } from '../../services/llm-decision-provider';

import type { IngestionState } from '../state';

export function createValidateChunksNode(
  provider?: Pick<IngestionDecisionProvider, 'routeReviewTask'>
) {
  return async function validateChunksNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    const validationIssues = validateChunks(state.chunks ?? []);
    const chunksById = new Map((state.chunks ?? []).map((chunk) => [chunk.chunkId, chunk]));
  const issuesByChunkId = new Set(
    validationIssues
      .filter((issue) => issue.chunkId && issue.requiresHumanReview)
      .map((issue) => issue.chunkId as string)
  );
    const reviewTasks = await Promise.all(
      validationIssues
        .filter((issue) => issue.requiresHumanReview)
        .map((issue) =>
          buildReviewTaskFromValidationIssue(
            {
              ingestionId: state.ingestionId,
              documentId: state.documentId,
              issue,
              chunk: issue.chunkId ? chunksById.get(issue.chunkId) : undefined,
            },
            { provider }
          )
        )
    );
    const hasHardFail = validationIssues.some((issue) => issue.validationTier === 'hard_fail');

    return {
      chunks: (state.chunks ?? []).map((chunk) => ({
        ...chunk,
        reviewStatus: issuesByChunkId.has(chunk.chunkId) ? 'review_required' : 'approved',
        indexStatus:
          issuesByChunkId.has(chunk.chunkId) || validationIssues.some((issue) => !issue.chunkId)
            ? 'pending'
            : chunk.indexStatus,
      })),
      validationIssues,
      reviewTasks,
      status: hasHardFail ? 'REVIEW_REQUIRED' : 'VALIDATED',
    };
  };
}

export const validateChunksNode = createValidateChunksNode();

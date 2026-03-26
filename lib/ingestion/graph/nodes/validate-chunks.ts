import type { ReviewTaskContract } from '../../contracts/review';
import { validateChunks } from '../../services/validation';

import type { IngestionState } from '../state';

export async function validateChunksNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const validationIssues = validateChunks(state.chunks ?? []);
  const reviewTasks: ReviewTaskContract[] = validationIssues
    .filter((issue) => issue.requiresHumanReview)
    .map((issue) => ({
      reviewTaskId: `${state.ingestionId}-${issue.issueId}`,
      ingestionId: state.ingestionId,
      documentId: state.documentId,
      scope: issue.chunkId ? 'chunk' : 'document',
      scopeRefId: issue.chunkId ?? state.documentId,
      reasonCode: issue.code,
      summary: issue.message,
      suggestedAction: 'approve',
    }));

  return {
    validationIssues,
    reviewTasks,
    status: validationIssues.length > 0 ? 'REVIEW_REQUIRED' : 'VALIDATED',
  };
}

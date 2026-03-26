import { interrupt } from '@langchain/langgraph';

import type { IngestionState } from '../state';

type ReviewDecision = {
  action: 'approve_document' | 'reject_document';
};

export async function reviewGateNode(
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

  if (decision.action === 'reject_document') {
    return {
      status: 'REJECTED',
    };
  }

  return {
    status: 'VALIDATED',
    chunks: (state.chunks ?? []).map((chunk) => ({
      ...chunk,
      reviewStatus: chunk.reviewStatus === 'review_required' ? 'approved' : chunk.reviewStatus,
    })),
  };
}

import { ingestionStorage } from '../../storage/repositories';
import type { IngestionStorage } from '../../storage/types';
import type { IngestionState } from '../state';

export function createFinalizeReportNode(storage: IngestionStorage = ingestionStorage) {
  return async function finalizeReportNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    const chunks = state.chunks ?? [];
    const isRowBatchMode = Boolean(state.rowBatchProgress);
    const indexedCount = isRowBatchMode
      ? state.metrics?.indexedChunks ?? 0
      : chunks.filter((chunk) => chunk.indexStatus === 'indexed').length;
    const rejectedCount = isRowBatchMode
      ? state.metrics?.rejectedChunks ?? 0
      : chunks.filter((chunk) => chunk.reviewStatus === 'rejected').length;
    const totalChunks = isRowBatchMode
      ? state.metrics?.totalChunks ?? 0
      : chunks.length;
    const status =
      state.executionMode === 'strategy_check'
        ? state.status === 'REVIEW_REQUIRED'
          ? 'REVIEW_REQUIRED'
          : 'CHUNKED'
        :
      state.status === 'REVIEW_REQUIRED'
        ? 'REVIEW_REQUIRED'
        : state.status === 'REJECTED'
        ? 'REJECTED'
        : totalChunks > 0 && indexedCount === totalChunks
          ? 'INDEXED'
        : indexedCount > 0
            ? 'PARTIALLY_INDEXED'
            : rejectedCount === totalChunks && totalChunks > 0
              ? 'REJECTED'
              : 'FAILED';

    await storage.saveIngestionRunResult?.({
      ingestionId: state.ingestionId,
      status,
      metrics: state.metrics,
      error: state.error,
    });

    return {
      status,
    };
  };
}

export const finalizeReportNode = createFinalizeReportNode();

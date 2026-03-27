import { ingestionStorage } from '../../storage/repositories';
import type { IngestionStorage } from '../../storage/types';
import type { IngestionState } from '../state';

export function createPersistChunksNode(storage: IngestionStorage = ingestionStorage) {
  return async function persistChunksNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    if (!state.document) {
      throw new Error('Cannot persist ingestion artifacts without document');
    }

    const isRowBatchMode =
      state.parserStrategy === 'xlsx' &&
      state.chunkingStrategy === 'row' &&
      state.executionMode !== 'strategy_check' &&
      Boolean(state.rowBatchProgress);
    const shouldPersistSections = !isRowBatchMode || !state.rowBatchProgress?.sectionsPersisted;
    const payload = {
      persistenceStage: 'draft' as const,
      ingestionId: state.ingestionId,
      document: state.document,
      sections: shouldPersistSections ? state.sections ?? [] : [],
      chunks: state.chunks ?? [],
      reviewTasks: state.reviewTasks ?? [],
      parserStrategy: state.parserStrategy,
      chunkingStrategy: state.chunkingStrategy,
      status: state.status,
      writeMode: isRowBatchMode ? ('append' as const) : ('replace' as const),
    };

    if (storage.saveDraftArtifacts) {
      await storage.saveDraftArtifacts(payload);
    } else if (storage.saveIngestionArtifacts) {
      await storage.saveIngestionArtifacts(payload);
    } else {
      throw new Error('No ingestion artifact persistence method configured');
    }

    const hasPendingReviewTasks = (state.reviewTasks ?? []).some((task) => task.status !== 'resolved');

    return {
      status: hasPendingReviewTasks ? 'REVIEW_REQUIRED' : state.status,
      rowBatchProgress: state.rowBatchProgress
        ? {
            ...state.rowBatchProgress,
            sectionsPersisted: state.rowBatchProgress.sectionsPersisted || shouldPersistSections,
          }
        : undefined,
    };
  };
}

export const persistChunksNode = createPersistChunksNode();

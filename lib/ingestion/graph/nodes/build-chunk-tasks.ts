import { buildChunkTasks } from '../../services/chunking';
import { loadXlsxRowChunkBatch } from '../../services/parsers/xlsx';

import type { IngestionState } from '../state';

export async function buildChunkTasksNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  if (
    state.parserStrategy === 'xlsx' &&
    state.chunkingStrategy === 'row' &&
    state.executionMode !== 'strategy_check'
  ) {
    const rowBatchPlan = state.rowBatchPlan;
    if (!rowBatchPlan || rowBatchPlan.totalBatches === 0) {
      return {
        rowBatchProgress: {
          currentBatchIndex: 0,
          totalBatches: 0,
          sectionsPersisted: false,
          processedChunks: 0,
          approvedChunks: 0,
          rejectedChunks: 0,
          indexedChunks: 0,
        },
        currentRowBatch: undefined,
        chunkTasks: [],
        chunks: [],
      };
    }

    const currentBatchIndex = state.rowBatchProgress?.currentBatchIndex ?? 0;
    const currentBatch = rowBatchPlan.batches[currentBatchIndex];

    if (!currentBatch) {
      return {
        chunkTasks: [],
        chunks: [],
      };
    }

    const chunks = await loadXlsxRowChunkBatch({
      documentId: state.documentId,
      sourceUri: state.sourceUri,
      batch: currentBatch,
    });

    return {
      chunkTasks: [],
      currentRowBatch: {
        ...currentBatch,
        isLastBatch: currentBatchIndex === rowBatchPlan.totalBatches - 1,
      },
      chunks,
      rowBatchProgress: state.rowBatchProgress ?? {
        currentBatchIndex,
        totalBatches: rowBatchPlan.totalBatches,
        sectionsPersisted: false,
        processedChunks: 0,
        approvedChunks: 0,
        rejectedChunks: 0,
        indexedChunks: 0,
      },
    };
  }

  const chunkTasks = buildChunkTasks({
    documentId: state.documentId,
    chunkingStrategy: state.chunkingStrategy ?? 'section',
    sections: state.sections ?? [],
  });

  return { chunkTasks };
}

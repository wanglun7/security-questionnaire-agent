import { runChunkWorker } from '../workers/chunk-worker';

import type { IngestionState } from '../state';

export async function aggregateChunksNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const chunks = await Promise.all((state.chunkTasks ?? []).map((task) => runChunkWorker(task)));

  return {
    chunks,
    status: 'CHUNKED',
    metrics: {
      ...state.metrics,
      totalChunks: chunks.length,
    },
  };
}

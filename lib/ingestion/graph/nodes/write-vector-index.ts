import { buildIndexableChunks } from '../../services/indexing';

import type { IngestionState } from '../state';

export async function writeVectorIndexNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const indexableChunks = await buildIndexableChunks(state.chunks ?? []);

  return {
    metrics: {
      ...state.metrics,
      totalChunks: indexableChunks.length,
    },
  };
}

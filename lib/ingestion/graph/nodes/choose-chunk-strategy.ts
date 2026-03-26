import type { IngestionState } from '../state';

export async function chooseChunkStrategyNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  return {
    chunkingStrategy: state.chunkingStrategy ?? 'section',
  };
}

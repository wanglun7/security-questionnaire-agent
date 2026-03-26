import type { IngestionState } from '../state';

export async function persistChunksNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  return {
    status: state.status,
  };
}

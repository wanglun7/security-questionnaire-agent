import type { IngestionState } from '../state';

export async function receiveIngestionRequestNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  return {
    ingestionId: state.ingestionId,
    status: 'RECEIVED',
  };
}

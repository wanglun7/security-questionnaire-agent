import type { IngestionState } from '../state';

export async function finalizeReportNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  return {
    status: state.status === 'REJECTED' ? 'REJECTED' : 'INDEXED',
  };
}

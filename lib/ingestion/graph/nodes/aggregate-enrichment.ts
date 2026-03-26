import { runEnrichmentWorker } from '../workers/enrichment-worker';

import type { IngestionState } from '../state';

export async function aggregateEnrichmentNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const chunks = await Promise.all((state.chunks ?? []).map((chunk) => runEnrichmentWorker(chunk)));
  return {
    chunks,
    status: 'ENRICHED',
  };
}

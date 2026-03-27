import { createEnrichmentWorker } from '../workers/enrichment-worker';
import type { IngestionDecisionProvider } from '../../services/llm-decision-provider';

import type { IngestionState } from '../state';

export function createAggregateEnrichmentNode(
  provider?: Pick<IngestionDecisionProvider, 'enrichChunk'>
) {
  const runEnrichmentWorker = createEnrichmentWorker(provider);

  return async function aggregateEnrichmentNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    const chunks = await Promise.all(
      (state.chunks ?? []).map((chunk) => runEnrichmentWorker(chunk))
    );
    return {
      chunks,
      status: 'ENRICHED',
    };
  };
}

export const aggregateEnrichmentNode = createAggregateEnrichmentNode();

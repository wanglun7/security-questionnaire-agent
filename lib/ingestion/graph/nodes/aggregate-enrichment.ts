import type { IngestionDecisionProvider } from '../../services/llm-decision-provider';
import type { EnrichmentLevel } from '../../contracts/enrichment';
import { executeEnrichment } from '../../services/enrichment-executor';

import type { IngestionState } from '../state';

export function createAggregateEnrichmentNode(
  provider?: Pick<IngestionDecisionProvider, 'enrichChunk'>,
  options?: {
    concurrency?: number;
    runDefaultEnrichLevel?: EnrichmentLevel;
    cacheRepository?: import('../../services/enrichment-cache').EnrichmentCacheRepository;
    promptVersion?: string;
    outputSchemaVersion?: string;
    modelId?: string;
  }
) {
  return async function aggregateEnrichmentNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    const result = await executeEnrichment(state.chunks ?? [], {
      provider,
      executionMode: state.executionMode,
      concurrency: options?.concurrency,
      runDefaultEnrichLevel: options?.runDefaultEnrichLevel,
      cacheRepository: options?.cacheRepository,
      promptVersion: options?.promptVersion,
      outputSchemaVersion: options?.outputSchemaVersion,
      modelId: options?.modelId,
    });

    return {
      chunks: result.chunks,
      status: 'ENRICHED',
      metrics: {
        ...state.metrics,
        ...result.metrics,
      },
    };
  };
}

export const aggregateEnrichmentNode = createAggregateEnrichmentNode();

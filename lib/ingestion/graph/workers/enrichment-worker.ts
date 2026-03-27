import type { ChunkContract } from '../../contracts/chunk';
import { enrichChunk } from '../../services/enrichment';
import type { IngestionDecisionProvider } from '../../services/llm-decision-provider';

export function createEnrichmentWorker(
  provider?: Pick<IngestionDecisionProvider, 'enrichChunk'>
) {
  return async function runEnrichmentWorker(chunk: ChunkContract): Promise<ChunkContract> {
    return enrichChunk(chunk, { provider });
  };
}

export const runEnrichmentWorker = createEnrichmentWorker();

import type { ChunkContract } from '../../contracts/chunk';
import { enrichChunk } from '../../services/enrichment';

export async function runEnrichmentWorker(chunk: ChunkContract): Promise<ChunkContract> {
  return enrichChunk(chunk);
}

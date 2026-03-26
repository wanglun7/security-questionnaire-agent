import type { ChunkContract } from '../contracts/chunk';

export async function buildIndexableChunks(chunks: ChunkContract[]): Promise<ChunkContract[]> {
  return chunks.filter((chunk) => chunk.reviewStatus !== 'review_required');
}

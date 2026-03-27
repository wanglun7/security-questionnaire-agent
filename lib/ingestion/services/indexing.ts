import type { ChunkContract } from '../contracts/chunk';

export async function buildIndexableChunks(chunks: ChunkContract[]): Promise<ChunkContract[]> {
  return chunks.filter(
    (chunk) =>
      chunk.reviewStatus === 'approved' &&
      (chunk.indexStatus === 'pending' ||
        chunk.indexStatus === 'reindex_required' ||
        chunk.indexStatus === 'stale')
  );
}

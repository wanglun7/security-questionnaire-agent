import type { ChunkContract } from '../contracts/chunk';

export async function enrichChunk(chunk: ChunkContract): Promise<ChunkContract> {
  const firstLine = chunk.cleanText.split('\n')[0]?.trim() ?? '';

  return {
    ...chunk,
    title: firstLine.slice(0, 60) || chunk.title,
    summary: chunk.cleanText.slice(0, 120),
  };
}

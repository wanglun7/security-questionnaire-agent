import { embed } from 'ai';
import { embeddingClient } from './embedding-client';

export async function generateEmbedding(text: string) {
  const { embedding } = await embed({
    model: embeddingClient.embedding('text-embedding-v3'),
    value: text,
  });
  return embedding;
}

import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { generateEmbedding } from '../ai/embeddings';
import { rerankKnowledgeResults, type RankedKnowledgeResult } from './ranking';
import { normalizeVectorSearchRows } from './result-shape';

export interface RetrievalResult extends RankedKnowledgeResult {}

export async function retrieveKnowledge(
  query: string,
  topK: number = 5
): Promise<RetrievalResult[]> {
  const queryEmbedding = await generateEmbedding(query);

  const results = await db.execute(sql`
    SELECT id, question, answer, category, document_source,
           1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM knowledge_base
    ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${topK}
  `);

  const rows = normalizeVectorSearchRows(results as any);

  return rerankKnowledgeResults({
    questionText: query,
    results: rows.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      category: row.category,
      documentSource: row.document_source,
      similarity: typeof row.similarity === 'number' ? row.similarity : Number.parseFloat(row.similarity),
    })),
  });
}

export interface RawVectorSearchRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  document_source: string;
  similarity: string | number;
}

export function normalizeVectorSearchRows(
  result: RawVectorSearchRow[] | { rows?: RawVectorSearchRow[] }
): RawVectorSearchRow[] {
  if (Array.isArray(result)) {
    return result;
  }

  return result.rows ?? [];
}

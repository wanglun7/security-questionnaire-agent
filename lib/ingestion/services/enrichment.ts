import type { ChunkContract } from '../contracts/chunk';
import type { IngestionDecisionProvider } from './llm-decision-provider';

function extractKeywords(text: string) {
  const terms = text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  return [...new Set(terms)].slice(0, 5);
}

export function enrichChunkDeterministic(chunk: ChunkContract): ChunkContract {
  const normalizedText = chunk.cleanText.trim();
  const firstLine = normalizedText.split('\n')[0]?.trim() ?? '';
  const summary = chunk.summary ?? normalizedText.slice(0, 120);
  const title = chunk.title ?? (firstLine.slice(0, 60) || chunk.title);
  const keywords = chunk.keywords?.length ? chunk.keywords : extractKeywords(normalizedText);
  const authorityLevel = chunk.authorityLevel ?? chunk.authorityGuess ?? 'medium';
  const questionsAnswered =
    chunk.questionsAnswered && chunk.questionsAnswered.length > 0
      ? chunk.questionsAnswered
      : /[?？]|^是否/.test(firstLine)
        ? [firstLine]
        : [];
  const reviewHints =
    keywords.length === 0 || !summary
      ? ['metadata_quality_low']
      : chunk.reviewHints;

  return {
    ...chunk,
    title,
    summary,
    keywords,
    questionsAnswered,
    authorityLevel,
    reviewHints,
  };
}

export async function enrichChunk(
  chunk: ChunkContract,
  options?: {
    provider?: Pick<IngestionDecisionProvider, 'enrichChunk'>;
  }
): Promise<ChunkContract> {
  const deterministic = enrichChunkDeterministic(chunk);
  if (!options?.provider?.enrichChunk) {
    throw new Error('LLM decision provider is required for chunk enrichment');
  }

  const decision = await options.provider.enrichChunk(deterministic);
  if (!decision) {
    throw new Error('LLM chunk enrichment returned no decision');
  }

  return {
    ...deterministic,
    ...decision,
    entities: decision.entities ?? deterministic.entities,
    questionsAnswered: decision.questionsAnswered ?? deterministic.questionsAnswered,
    reviewHints: decision.reviewHints ?? deterministic.reviewHints,
  };
}

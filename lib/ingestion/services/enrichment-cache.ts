import type { ChunkContract } from '../contracts/chunk';
import type {
  EnrichmentCacheEntry,
  EnrichmentLevel,
  EnrichmentPlan,
  EnrichmentPromptVariant,
} from '../contracts/enrichment';
import type { ChunkEnrichmentDecisionContract } from '../contracts/decision';

export type EnrichmentCacheRepository = {
  get(cacheKey: string): Promise<EnrichmentCacheEntry | null>;
  put(entry: EnrichmentCacheEntry): Promise<void>;
};

export function buildEnrichmentCacheKey(input: {
  tenantId: string;
  checksum: string;
  chunkStrategy: ChunkContract['chunkStrategy'];
  enrichLevel: EnrichmentLevel;
  promptVariant: EnrichmentPromptVariant;
  promptVersion: string;
  outputSchemaVersion: string;
  modelId: string;
}) {
  return [
    input.tenantId,
    input.checksum,
    input.chunkStrategy,
    input.enrichLevel,
    input.promptVariant,
    input.promptVersion,
    input.outputSchemaVersion,
    input.modelId,
  ].join('::');
}

export function toCacheEntry(input: {
  chunk: ChunkContract;
  plan: EnrichmentPlan;
  promptVersion: string;
  outputSchemaVersion: string;
  modelId: string;
  output: ChunkEnrichmentDecisionContract;
}): EnrichmentCacheEntry {
  return {
    cacheKey:
      input.plan.cacheKey ??
      buildEnrichmentCacheKey({
        tenantId: input.chunk.tenant,
        checksum: input.chunk.checksum,
        chunkStrategy: input.chunk.chunkStrategy,
        enrichLevel: input.plan.enrichLevel,
        promptVariant: input.plan.promptVariant,
        promptVersion: input.promptVersion,
        outputSchemaVersion: input.outputSchemaVersion,
        modelId: input.modelId,
      }),
    tenantId: input.chunk.tenant,
    checksum: input.chunk.checksum,
    chunkStrategy: input.chunk.chunkStrategy,
    enrichLevel: input.plan.enrichLevel,
    promptVariant: input.plan.promptVariant,
    chunkId: input.chunk.chunkId,
    promptVersion: input.promptVersion,
    outputSchemaVersion: input.outputSchemaVersion,
    modelId: input.modelId,
    output: input.output,
    createdAt: new Date().toISOString(),
  };
}

export function applyCachedEnrichment(
  chunk: ChunkContract,
  output: ChunkEnrichmentDecisionContract
): ChunkContract {
  return {
    ...chunk,
    ...output,
    entities: output.entities ?? chunk.entities,
    questionsAnswered: output.questionsAnswered ?? chunk.questionsAnswered,
    reviewHints: output.reviewHints ?? chunk.reviewHints,
    authorityGuess: output.authorityGuess ?? chunk.authorityGuess,
  };
}

export function extractCacheableOutput(
  chunk: ChunkContract
): ChunkEnrichmentDecisionContract {
  return {
    title: chunk.title,
    summary: chunk.summary,
    keywords: chunk.keywords,
    entities: chunk.entities,
    questionsAnswered: chunk.questionsAnswered,
    versionGuess: chunk.versionGuess,
    authorityGuess: chunk.authorityGuess,
    reviewHints: chunk.reviewHints,
  };
}

export function createInMemoryEnrichmentCacheRepository(): EnrichmentCacheRepository {
  const entries = new Map<string, EnrichmentCacheEntry>();

  return {
    async get(cacheKey: string) {
      return entries.get(cacheKey) ?? null;
    },
    async put(entry: EnrichmentCacheEntry) {
      entries.set(entry.cacheKey, entry);
    },
  };
}

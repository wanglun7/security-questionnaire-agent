import type { ChunkContract } from '../contracts/chunk';
import type { ChunkEnrichmentDecisionContract } from '../contracts/decision';
import type { EnrichmentLevel } from '../contracts/enrichment';
import type { IngestionDecisionProvider } from './llm-decision-provider';
import {
  applyCachedEnrichment,
  buildEnrichmentCacheKey,
  extractCacheableOutput,
  toCacheEntry,
  type EnrichmentCacheRepository,
} from './enrichment-cache';
import { planChunkEnrichment } from './enrichment-policy';
import { enrichChunk, enrichChunkDeterministic } from './enrichment';

export type ExecuteEnrichmentOptions = {
  executionMode?: 'strategy_check' | 'full_ingestion';
  runDefaultEnrichLevel?: EnrichmentLevel;
  concurrency?: number;
  cacheRepository?: EnrichmentCacheRepository;
  promptVersion?: string;
  outputSchemaVersion?: string;
  modelId?: string;
  provider?: Pick<IngestionDecisionProvider, 'enrichChunk'>;
};

function mergeLevelCount(
  counts: Partial<Record<EnrichmentLevel, number>>,
  level: EnrichmentLevel
) {
  counts[level] = (counts[level] ?? 0) + 1;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex] as T, currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, values.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function executeEnrichment(
  chunks: ChunkContract[],
  options: ExecuteEnrichmentOptions = {}
) {
  const executionMode = options.executionMode ?? 'full_ingestion';
  const runDefaultEnrichLevel = options.runDefaultEnrichLevel ?? 'L2';
  const concurrency =
    options.concurrency ?? Number(process.env.INGESTION_ENRICH_CONCURRENCY || 4);
  const promptVersion = options.promptVersion ?? 'prompt-v1';
  const outputSchemaVersion = options.outputSchemaVersion ?? 'schema-v1';
  const modelId = options.modelId ?? process.env.OPENAI_COMPLETION_MODEL ?? 'gpt-5.2';

  const metrics = {
    runDefaultEnrichLevel,
    effectiveEnrichLevelCounts: {} as Partial<Record<EnrichmentLevel, number>>,
    enrichEligibleChunks: chunks.length,
    enrichSkippedChunks: 0,
    enrichLlmChunks: 0,
    enrichCacheHits: 0,
    enrichCacheMisses: 0,
    enrichRetriedChunks: 0,
    enrichFailedChunks: 0,
  };

  const nextChunks = await mapWithConcurrency(chunks, concurrency, async (chunk) => {
    const plan = planChunkEnrichment({
      executionMode,
      runDefaultEnrichLevel,
      chunk,
    });
    const deterministic = enrichChunkDeterministic(chunk);
    mergeLevelCount(metrics.effectiveEnrichLevelCounts, plan.enrichLevel);

    if (!plan.shouldCallLlm) {
      metrics.enrichSkippedChunks += 1;
      return deterministic;
    }

    const cacheKey = buildEnrichmentCacheKey({
      tenantId: chunk.tenant,
      checksum: chunk.checksum,
      chunkStrategy: chunk.chunkStrategy,
      enrichLevel: plan.enrichLevel,
      promptVariant: plan.promptVariant,
      promptVersion,
      outputSchemaVersion,
      modelId,
    });

    if (options.cacheRepository) {
      const cached = await options.cacheRepository.get(cacheKey);
      if (cached) {
        metrics.enrichCacheHits += 1;
        metrics.enrichSkippedChunks += 1;
        return applyCachedEnrichment(deterministic, cached.output);
      }
    }

    metrics.enrichLlmChunks += 1;
    metrics.enrichCacheMisses += 1;

    try {
      const enriched = await enrichChunk(chunk, { provider: options.provider });
      if (options.cacheRepository) {
        const cacheableOutput = extractCacheableOutput(enriched) as ChunkEnrichmentDecisionContract;
        await options.cacheRepository.put(
          toCacheEntry({
            chunk,
            plan: {
              ...plan,
              cacheKey,
            },
            promptVersion,
            outputSchemaVersion,
            modelId,
            output: cacheableOutput,
          })
        );
      }
      return enriched;
    } catch {
      metrics.enrichFailedChunks += 1;
      return deterministic;
    }
  });

  return {
    chunks: nextChunks,
    metrics,
  };
}

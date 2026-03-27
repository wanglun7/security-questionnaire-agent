import type { ChunkStrategy } from './chunk';
import type { ChunkEnrichmentDecisionContract } from './decision';

export type EnrichmentLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type EnrichmentField =
  | 'title'
  | 'summary'
  | 'keywords'
  | 'entities'
  | 'questionsAnswered'
  | 'versionGuess'
  | 'authorityGuess'
  | 'reviewHints';

export type EnrichmentPromptVariant =
  | 'section_l1'
  | 'section_l2'
  | 'section_l3'
  | 'faq_l1'
  | 'faq_l2'
  | 'faq_l3'
  | 'clause_l1'
  | 'clause_l2'
  | 'clause_l3'
  | 'row_rule'
  | 'row_l1'
  | 'row_l2'
  | 'row_l3';

export type EnrichmentSkipReason =
  | 'strategy_check_mode'
  | 'short_chunk'
  | 'title_only'
  | 'boilerplate'
  | 'row_fast_path'
  | 'cache_hit';

export type EnrichmentPlan = {
  chunkId: string;
  chunkStrategy: ChunkStrategy;
  executionMode: 'strategy_check' | 'full_ingestion';
  enrichLevel: EnrichmentLevel;
  shouldCallLlm: boolean;
  skipReason?: EnrichmentSkipReason;
  requestedFields: EnrichmentField[];
  expectedNonEmptyFields: EnrichmentField[];
  promptVariant: EnrichmentPromptVariant;
  policyReasons: string[];
  policySignals?: Record<string, string | number | boolean>;
  cacheKey?: string;
};

export type ChunkEnrichmentRuntime = {
  runDefaultEnrichLevel?: EnrichmentLevel;
  effectiveEnrichLevelCounts?: Partial<Record<EnrichmentLevel, number>>;
  enrichEligibleChunks?: number;
  enrichSkippedChunks?: number;
  enrichLlmChunks?: number;
  enrichCacheHits?: number;
  enrichCacheMisses?: number;
  enrichRetriedChunks?: number;
  enrichFailedChunks?: number;
};

export type EnrichmentCacheEntry = {
  cacheKey: string;
  tenantId: string;
  checksum: string;
  chunkStrategy: ChunkStrategy;
  enrichLevel: EnrichmentLevel;
  promptVariant: EnrichmentPromptVariant;
  chunkId: string;
  promptVersion: string;
  outputSchemaVersion: string;
  modelId: string;
  output: ChunkEnrichmentDecisionContract;
  createdAt: string;
};

export type ChunkEnrichmentResult = {
  chunkId: string;
  enrichLevel: EnrichmentLevel;
  fromCache: boolean;
};

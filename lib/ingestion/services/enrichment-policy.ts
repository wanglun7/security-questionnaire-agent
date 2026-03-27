import type { ChunkContract, ChunkStrategy } from '../contracts/chunk';
import type {
  EnrichmentField,
  EnrichmentLevel,
  EnrichmentPlan,
  EnrichmentPromptVariant,
} from '../contracts/enrichment';

export type EnrichmentPolicyInput = {
  executionMode: 'strategy_check' | 'full_ingestion';
  runDefaultEnrichLevel?: EnrichmentLevel;
  chunk: ChunkContract;
};

const LEVEL_FIELDS: Record<Exclude<EnrichmentLevel, 'L0'>, EnrichmentField[]> = {
  L1: ['title', 'summary'],
  L2: ['title', 'summary', 'keywords', 'questionsAnswered', 'entities'],
  L3: [
    'title',
    'summary',
    'keywords',
    'questionsAnswered',
    'entities',
    'versionGuess',
    'authorityGuess',
    'reviewHints',
  ],
};

function createSkippedPlan(
  input: EnrichmentPolicyInput,
  skipReason: EnrichmentPlan['skipReason'],
  promptVariant: EnrichmentPromptVariant,
  policyReasons: string[]
): EnrichmentPlan {
  return {
    chunkId: input.chunk.chunkId,
    chunkStrategy: input.chunk.chunkStrategy,
    executionMode: input.executionMode,
    enrichLevel: 'L0',
    shouldCallLlm: false,
    skipReason,
    requestedFields: [],
    expectedNonEmptyFields: [],
    promptVariant,
    policyReasons,
  };
}

function isTitleOnlyChunk(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || lines.length > 2) {
    return false;
  }

  const first = lines[0] ?? '';
  const second = lines[1] ?? '';
  const firstWordCount = first.split(/\s+/).filter(Boolean).length;
  const looksLikeHeading =
    firstWordCount <= 8 && !/[.!?。！？]$/.test(first) && !/[,:;]\s+\S+/.test(first);

  return (
    first.length <= 80 &&
    looksLikeHeading &&
    (!second ||
      /^(last updated|updated|effective date|version|date)\s*[:：-]/i.test(second))
  );
}

function getPromptVariant(chunkStrategy: ChunkStrategy, level: Exclude<EnrichmentLevel, 'L0'>) {
  return `${chunkStrategy}_${level.toLowerCase()}` as EnrichmentPromptVariant;
}

function getSkipPromptVariant(chunkStrategy: Exclude<ChunkStrategy, 'row'>) {
  return chunkStrategy === 'clause' ? 'clause_l1' : 'section_l1';
}

function getExpectedNonEmptyFields(chunkStrategy: ChunkStrategy) {
  const fields: EnrichmentField[] = ['title', 'summary'];
  if (chunkStrategy === 'faq') {
    fields.push('questionsAnswered');
  }
  return fields;
}

export function planChunkEnrichment(input: EnrichmentPolicyInput): EnrichmentPlan {
  const runDefaultEnrichLevel = input.runDefaultEnrichLevel ?? 'L2';
  const text = input.chunk.cleanText.trim();

  if (input.executionMode === 'strategy_check') {
    return createSkippedPlan(
      input,
      'strategy_check_mode',
      input.chunk.chunkStrategy === 'row' ? 'row_rule' : 'section_l1',
      ['execution_mode_strategy_check']
    );
  }

  if (input.chunk.chunkStrategy === 'row') {
    return createSkippedPlan(input, 'row_fast_path', 'row_rule', ['row_default_fast_path']);
  }

  if (input.chunk.chunkStrategy === 'faq') {
    return {
      chunkId: input.chunk.chunkId,
      chunkStrategy: input.chunk.chunkStrategy,
      executionMode: input.executionMode,
      enrichLevel: 'L2',
      shouldCallLlm: true,
      requestedFields: LEVEL_FIELDS.L2,
      expectedNonEmptyFields: getExpectedNonEmptyFields(input.chunk.chunkStrategy),
      promptVariant: 'faq_l2',
      policyReasons: ['faq_default_l2'],
      policySignals: {
        textLength: text.length,
        runDefaultEnrichLevel,
      },
    };
  }

  if (isTitleOnlyChunk(text)) {
    return createSkippedPlan(
      input,
      'title_only',
      getSkipPromptVariant(input.chunk.chunkStrategy),
      ['title_only_skip']
    );
  }

  if (text.length < 80) {
    return createSkippedPlan(
      input,
      'short_chunk',
      getSkipPromptVariant(input.chunk.chunkStrategy),
      ['short_chunk_skip']
    );
  }

  const enrichLevel: Exclude<EnrichmentLevel, 'L0'> =
    runDefaultEnrichLevel === 'L0' ? 'L1' : runDefaultEnrichLevel;
  const promptVariant = getPromptVariant(input.chunk.chunkStrategy, enrichLevel);
  const policyReason =
    input.chunk.chunkStrategy === 'clause' ? 'clause_default_l2' : 'section_default_l2';

  return {
    chunkId: input.chunk.chunkId,
    chunkStrategy: input.chunk.chunkStrategy,
    executionMode: input.executionMode,
    enrichLevel,
    shouldCallLlm: true,
    requestedFields: LEVEL_FIELDS[enrichLevel],
    expectedNonEmptyFields: getExpectedNonEmptyFields(input.chunk.chunkStrategy),
    promptVariant,
    policyReasons: [policyReason],
    policySignals: {
      textLength: text.length,
      runDefaultEnrichLevel,
    },
  };
}

import type { ChunkContract, ChunkStrategy } from '../contracts/chunk';
import type { EnrichmentPromptVariant } from '../contracts/enrichment';

export function resolveDefaultEnrichmentPromptVariant(
  chunkStrategy: ChunkStrategy
): EnrichmentPromptVariant {
  switch (chunkStrategy) {
    case 'faq':
      return 'faq_l2';
    case 'clause':
      return 'clause_l2';
    case 'row':
      return 'row_rule';
    case 'section':
    default:
      return 'section_l2';
  }
}

function getChunkTypeInstruction(promptVariant: EnrichmentPromptVariant) {
  if (promptVariant.startsWith('faq_')) {
    return 'This is a faq chunk. Treat it as one question-answer pair.';
  }
  if (promptVariant.startsWith('clause_')) {
    return 'This is a legal clause chunk. Preserve legal meaning and clause boundaries.';
  }
  if (promptVariant.startsWith('section_')) {
    return 'This is a section chunk. Preserve topical summary and section meaning.';
  }
  return 'This is a row-derived chunk.';
}

function getRequestedKeys(promptVariant: EnrichmentPromptVariant) {
  if (promptVariant.endsWith('_l1')) {
    return 'title, summary';
  }

  if (promptVariant.endsWith('_l3')) {
    return 'title, summary, keywords, entities, questionsAnswered, versionGuess, authorityGuess, reviewHints';
  }

  return 'title, summary, keywords, entities, questionsAnswered';
}

export function buildEnrichmentPrompt({
  promptVariant,
  chunk,
}: {
  promptVariant: EnrichmentPromptVariant;
  chunk: ChunkContract;
}) {
  if (promptVariant === 'row_rule') {
    return null;
  }

  return [
    'You are enriching a chunk for an enterprise knowledge ingestion workflow.',
    `Return a JSON object with exactly these keys: ${getRequestedKeys(promptVariant)}.`,
    'Length constraints:',
    '- title <= 120 characters',
    '- summary <= 240 characters',
    getChunkTypeInstruction(promptVariant),
    'Do not modify chunk boundaries, source anchors, or governance state.',
    `chunkStrategy: ${chunk.chunkStrategy}`,
    `cleanText: ${chunk.cleanText.slice(0, 2000)}`,
  ].join('\n');
}

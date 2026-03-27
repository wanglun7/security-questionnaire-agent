import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import type { EnrichmentPromptVariant } from '../../../lib/ingestion/contracts/enrichment';
import {
  buildEnrichmentPrompt,
  resolveDefaultEnrichmentPromptVariant,
} from '../../../lib/ingestion/services/enrichment-prompts';

function makeChunk(overrides: Partial<ChunkContract> = {}): ChunkContract {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    tenant: 'tenant-a',
    rawTextRef: 'blob://chunk-1',
    cleanText:
      'Employees must submit leave requests through the HR system at least two weeks before the requested start date.',
    aclTags: [],
    checksum: 'checksum-1',
    reviewStatus: 'pending',
    indexStatus: 'pending',
    chunkStrategy: 'section',
    span: { paragraphStart: 1, paragraphEnd: 1 },
    metadataVersion: 1,
    ...overrides,
  };
}

function promptFor(variant: EnrichmentPromptVariant, chunk: ChunkContract) {
  return buildEnrichmentPrompt({
    promptVariant: variant,
    chunk,
  });
}

test('section_l1 prompt only requests title and summary', () => {
  const prompt = promptFor('section_l1', makeChunk());

  assert.ok(prompt);
  assert.match(prompt ?? '', /exactly these keys: title, summary/i);
  assert.doesNotMatch(prompt ?? '', /keywords/i);
  assert.doesNotMatch(prompt ?? '', /questionsAnswered/i);
});

test('faq_l2 prompt explicitly requests questions answered metadata', () => {
  const prompt = promptFor(
    'faq_l2',
    makeChunk({
      chunkStrategy: 'faq',
      cleanText: 'What is SSO?\nSSO lets users authenticate once and access multiple systems.',
    })
  );

  assert.ok(prompt);
  assert.match(prompt ?? '', /exactly these keys: title, summary, keywords, entities, questionsAnswered/i);
  assert.match(prompt ?? '', /faq chunk/i);
  assert.match(prompt ?? '', /question-answer pair/i);
});

test('clause_l3 prompt requests governance-oriented optional fields', () => {
  const prompt = promptFor(
    'clause_l3',
    makeChunk({
      chunkStrategy: 'clause',
      cleanText:
        '2.1 Audit Rights. Each party may, upon thirty (30) days notice, inspect the other party records relevant to this Agreement.',
    })
  );

  assert.ok(prompt);
  assert.match(
    prompt ?? '',
    /exactly these keys: title, summary, keywords, entities, questionsAnswered, versionGuess, authorityGuess, reviewHints/i
  );
  assert.doesNotMatch(prompt ?? '', /authorityLevel/i);
  assert.match(prompt ?? '', /legal clause/i);
});

test('enrichment prompt explicitly constrains title and summary lengths', () => {
  const prompt = promptFor('section_l2', makeChunk());

  assert.ok(prompt);
  assert.match(prompt ?? '', /title\s*<=\s*120/i);
  assert.match(prompt ?? '', /summary\s*<=\s*240/i);
});

test('row_rule does not produce an LLM prompt', () => {
  const prompt = promptFor(
    'row_rule',
    makeChunk({
      chunkStrategy: 'row',
      cleanText: 'ID | Status | Evidence',
    })
  );

  assert.equal(prompt, null);
});

test('default prompt variant resolution follows chunk strategy defaults', () => {
  assert.equal(resolveDefaultEnrichmentPromptVariant('section'), 'section_l2');
  assert.equal(resolveDefaultEnrichmentPromptVariant('faq'), 'faq_l2');
  assert.equal(resolveDefaultEnrichmentPromptVariant('clause'), 'clause_l2');
  assert.equal(resolveDefaultEnrichmentPromptVariant('row'), 'row_rule');
});

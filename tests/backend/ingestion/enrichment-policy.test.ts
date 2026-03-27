import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import {
  planChunkEnrichment,
  type EnrichmentPolicyInput,
} from '../../../lib/ingestion/services/enrichment-policy';

function makeChunk(overrides: Partial<ChunkContract> = {}): ChunkContract {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    tenant: 'tenant-a',
    rawTextRef: 'blob://chunk-1',
    cleanText:
      'This employee handbook section explains leave policy eligibility, approval workflow, and required notice periods for full-time employees.',
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

function makeInput(
  overrides: Partial<EnrichmentPolicyInput> = {}
): EnrichmentPolicyInput {
  return {
    executionMode: 'full_ingestion',
    runDefaultEnrichLevel: 'L2',
    chunk: makeChunk(),
    ...overrides,
  };
}

test('strategy_check always returns L0 without calling the LLM', () => {
  const plan = planChunkEnrichment(
    makeInput({
      executionMode: 'strategy_check',
    })
  );

  assert.equal(plan.enrichLevel, 'L0');
  assert.equal(plan.shouldCallLlm, false);
  assert.equal(plan.skipReason, 'strategy_check_mode');
  assert.ok(plan.policyReasons.includes('execution_mode_strategy_check'));
});

test('section chunks default to L2 with summary-oriented expected fields', () => {
  const plan = planChunkEnrichment(makeInput());

  assert.equal(plan.enrichLevel, 'L2');
  assert.equal(plan.shouldCallLlm, true);
  assert.equal(plan.promptVariant, 'section_l2');
  assert.deepEqual(plan.expectedNonEmptyFields, ['title', 'summary']);
  assert.ok(plan.requestedFields.includes('keywords'));
  assert.ok(plan.requestedFields.includes('questionsAnswered'));
  assert.ok(plan.policyReasons.includes('section_default_l2'));
});

test('faq chunks stay on L2 and expect questions answered metadata', () => {
  const plan = planChunkEnrichment(
    makeInput({
      chunk: makeChunk({
        chunkStrategy: 'faq',
        cleanText: 'What is SSO?\nSSO lets users authenticate once and access multiple systems.',
      }),
    })
  );

  assert.equal(plan.enrichLevel, 'L2');
  assert.equal(plan.promptVariant, 'faq_l2');
  assert.ok(plan.expectedNonEmptyFields.includes('questionsAnswered'));
  assert.ok(plan.policyReasons.includes('faq_default_l2'));
});

test('clause chunks stay on L2 and request entity extraction', () => {
  const plan = planChunkEnrichment(
    makeInput({
      chunk: makeChunk({
        chunkStrategy: 'clause',
        cleanText:
          '2.1 Audit Rights. Each party may, upon thirty (30) days notice, inspect the other party records relevant to this Agreement.',
      }),
    })
  );

  assert.equal(plan.enrichLevel, 'L2');
  assert.equal(plan.promptVariant, 'clause_l2');
  assert.ok(plan.requestedFields.includes('entities'));
  assert.ok(plan.policyReasons.includes('clause_default_l2'));
});

test('row chunks default to L0 row fast path instead of full LLM enrichment', () => {
  const plan = planChunkEnrichment(
    makeInput({
      chunk: makeChunk({
        chunkStrategy: 'row',
        cleanText: 'ID | Status | Evidence',
      }),
    })
  );

  assert.equal(plan.enrichLevel, 'L0');
  assert.equal(plan.shouldCallLlm, false);
  assert.equal(plan.promptVariant, 'row_rule');
  assert.equal(plan.skipReason, 'row_fast_path');
  assert.ok(plan.policyReasons.includes('row_default_fast_path'));
});

test('short chunks are skipped even during full ingestion', () => {
  const plan = planChunkEnrichment(
    makeInput({
      chunk: makeChunk({
        cleanText: 'Employees must notify HR promptly.',
      }),
    })
  );

  assert.equal(plan.enrichLevel, 'L0');
  assert.equal(plan.shouldCallLlm, false);
  assert.equal(plan.skipReason, 'short_chunk');
  assert.ok(plan.policyReasons.includes('short_chunk_skip'));
});

test('title-only chunks are skipped with a dedicated reason', () => {
  const plan = planChunkEnrichment(
    makeInput({
      chunk: makeChunk({
        cleanText: 'Policy Manual\nLast Updated: 2018-01-08',
      }),
    })
  );

  assert.equal(plan.enrichLevel, 'L0');
  assert.equal(plan.shouldCallLlm, false);
  assert.equal(plan.skipReason, 'title_only');
  assert.ok(plan.policyReasons.includes('title_only_skip'));
});

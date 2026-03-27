import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import type { ChunkEnrichmentDecisionContract } from '../../../lib/ingestion/contracts/decision';
import type {
  EnrichmentLevel,
  EnrichmentPlan,
} from '../../../lib/ingestion/contracts/enrichment';
import type { IngestionState } from '../../../lib/ingestion/graph/state';

test('chunk contract contains review and span fields', () => {
  const chunk: ChunkContract = {
    chunkId: 'chunk_1',
    documentId: 'doc_1',
    tenant: 'tenant-default',
    rawTextRef: 'blob://1',
    cleanText: 'hello',
    aclTags: [],
    checksum: 'checksum-1',
    reviewStatus: 'pending',
    indexStatus: 'pending',
    chunkStrategy: 'section',
    span: {},
    metadataVersion: 1,
  };

  assert.equal(chunk.reviewStatus, 'pending');
  assert.equal(chunk.chunkStrategy, 'section');
});

test('ingestion state tracks workflow status', () => {
  const state: IngestionState = {
    ingestionId: 'ing_1',
    documentId: 'doc_1',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'RECEIVED',
  };

  assert.equal(state.status, 'RECEIVED');
});

test('chunk enrichment decision contract uses authorityGuess instead of authorityLevel', () => {
  const decision: ChunkEnrichmentDecisionContract = {
    title: 'Policy summary',
    summary: 'Summarized chunk',
    keywords: ['policy'],
    authorityGuess: 'high',
    reviewHints: ['needs_version_review'],
  };

  assert.equal(decision.authorityGuess, 'high');
  assert.equal('authorityLevel' in decision, false);
});

test('enrichment plan contract supports policy trace and expected non-empty fields', () => {
  const enrichLevel: EnrichmentLevel = 'L2';
  const plan: EnrichmentPlan = {
    chunkId: 'chunk-1',
    chunkStrategy: 'section',
    executionMode: 'full_ingestion',
    enrichLevel,
    shouldCallLlm: true,
    requestedFields: ['title', 'summary', 'keywords', 'questionsAnswered', 'entities'],
    expectedNonEmptyFields: ['title', 'summary'],
    promptVariant: 'section_l2',
    policyReasons: ['default_full_ingestion_l2', 'section_chunk_default'],
    policySignals: {
      isShortChunk: false,
      tokenEstimate: 240,
    },
    cacheKey: 'cache-key-1',
  };

  assert.equal(plan.enrichLevel, 'L2');
  assert.deepEqual(plan.expectedNonEmptyFields, ['title', 'summary']);
  assert.deepEqual(plan.policyReasons, ['default_full_ingestion_l2', 'section_chunk_default']);
});

test('ingestion state metrics distinguish run default level from effective chunk counts', () => {
  const state: IngestionState = {
    ingestionId: 'ing_2',
    documentId: 'doc_2',
    sourceUri: '/tmp/b.pdf',
    originalFilename: 'b.pdf',
    mimeType: 'application/pdf',
    status: 'ENRICHED',
    metrics: {
      runDefaultEnrichLevel: 'L2',
      effectiveEnrichLevelCounts: {
        L0: 3,
        L2: 7,
      },
      enrichEligibleChunks: 10,
      enrichSkippedChunks: 3,
      enrichLlmChunks: 7,
      enrichCacheHits: 1,
      enrichCacheMisses: 6,
      enrichRetriedChunks: 2,
      enrichFailedChunks: 1,
    },
  };

  assert.equal(state.metrics?.runDefaultEnrichLevel, 'L2');
  assert.equal(state.metrics?.effectiveEnrichLevelCounts?.L0, 3);
  assert.equal(state.metrics?.effectiveEnrichLevelCounts?.L2, 7);
});

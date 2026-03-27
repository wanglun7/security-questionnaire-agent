import test from 'node:test';
import assert from 'node:assert/strict';

import { createAggregateEnrichmentNode } from '../../../lib/ingestion/graph/nodes/aggregate-enrichment';
import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import { createInMemoryEnrichmentCacheRepository } from '../../../lib/ingestion/services/enrichment-cache';

function makeChunk(id: string, overrides: Partial<ChunkContract> = {}): ChunkContract {
  return {
    chunkId: id,
    documentId: 'doc-1',
    tenant: 'tenant-a',
    rawTextRef: `blob://${id}`,
    cleanText:
      'Employees must submit leave requests through the HR system at least two weeks before the requested start date.',
    aclTags: [],
    checksum: `checksum-${id}`,
    reviewStatus: 'approved',
    indexStatus: 'pending',
    chunkStrategy: 'section',
    span: { paragraphStart: 1, paragraphEnd: 1 },
    metadataVersion: 1,
    ...overrides,
  };
}

test('aggregate enrichment respects bounded concurrency instead of raw Promise.all', async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const node = createAggregateEnrichmentNode(
    {
      enrichChunk: async (chunk) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;

        return {
          title: `${chunk.chunkId} title`,
          summary: `${chunk.chunkId} summary`,
          keywords: ['policy'],
        };
      },
    },
    {
      concurrency: 2,
      runDefaultEnrichLevel: 'L2',
    }
  );

  const result = await node({
    ingestionId: 'ing-1',
    documentId: 'doc-1',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'CHUNKED',
    executionMode: 'full_ingestion',
    chunks: [
      makeChunk('chunk-1'),
      makeChunk('chunk-2'),
      makeChunk('chunk-3'),
      makeChunk('chunk-4'),
    ],
  });

  assert.equal(result.status, 'ENRICHED');
  assert.equal(maxInFlight <= 2, true);
  assert.equal(result.metrics?.runDefaultEnrichLevel, 'L2');
  assert.equal(result.metrics?.enrichLlmChunks, 4);
});

test('aggregate enrichment skips provider calls during strategy_check', async () => {
  let calls = 0;
  const node = createAggregateEnrichmentNode(
    {
      enrichChunk: async () => {
        calls += 1;
        throw new Error('should not be called');
      },
    },
    {
      concurrency: 2,
      runDefaultEnrichLevel: 'L2',
    }
  );

  const result = await node({
    ingestionId: 'ing-2',
    documentId: 'doc-2',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'CHUNKED',
    executionMode: 'strategy_check',
    chunks: [makeChunk('chunk-1')],
  });

  assert.equal(calls, 0);
  assert.equal(result.status, 'ENRICHED');
  assert.equal(result.metrics?.enrichSkippedChunks, 1);
  assert.equal(result.chunks?.[0]?.title?.length ? true : false, true);
});

test('aggregate enrichment falls back per chunk when provider fails', async () => {
  const node = createAggregateEnrichmentNode(
    {
      enrichChunk: async (chunk) => {
        if (chunk.chunkId === 'chunk-2') {
          throw new Error('provider failed');
        }

        return {
          title: `${chunk.chunkId} title`,
          summary: `${chunk.chunkId} summary`,
          keywords: ['policy'],
        };
      },
    },
    {
      concurrency: 2,
      runDefaultEnrichLevel: 'L2',
    }
  );

  const result = await node({
    ingestionId: 'ing-3',
    documentId: 'doc-3',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'CHUNKED',
    executionMode: 'full_ingestion',
    chunks: [makeChunk('chunk-1'), makeChunk('chunk-2')],
  });

  assert.equal(result.status, 'ENRICHED');
  assert.equal(result.metrics?.enrichFailedChunks, 1);
  assert.equal(result.chunks?.every((chunk) => Boolean(chunk.summary)), true);
});

test('aggregate enrichment skips provider calls on cache hit', async () => {
  const cacheRepository = createInMemoryEnrichmentCacheRepository();
  let providerCalls = 0;

  const node = createAggregateEnrichmentNode(
    {
      enrichChunk: async () => {
        providerCalls += 1;
        return {
          title: 'Cached title',
          summary: 'Cached summary',
          keywords: ['policy'],
        };
      },
    },
    {
      concurrency: 2,
      runDefaultEnrichLevel: 'L2',
      cacheRepository,
      modelId: 'gpt-5.2',
      promptVersion: 'prompt-v1',
      outputSchemaVersion: 'schema-v1',
    }
  );

  await node({
    ingestionId: 'ing-4',
    documentId: 'doc-4',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'CHUNKED',
    executionMode: 'full_ingestion',
    chunks: [makeChunk('chunk-1')],
  });

  const cachedResult = await node({
    ingestionId: 'ing-4',
    documentId: 'doc-4',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'CHUNKED',
    executionMode: 'full_ingestion',
    chunks: [makeChunk('chunk-1')],
  });

  assert.equal(providerCalls, 1);
  assert.equal(cachedResult.metrics?.enrichCacheHits, 1);
  assert.equal(cachedResult.chunks?.[0]?.title, 'Cached title');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import { executeEnrichment } from '../../../lib/ingestion/services/enrichment-executor';
import {
  buildEnrichmentCacheKey,
  createInMemoryEnrichmentCacheRepository,
} from '../../../lib/ingestion/services/enrichment-cache';

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

test('cache key changes when output schema version changes', () => {
  const chunk = makeChunk('chunk-1');
  const base = buildEnrichmentCacheKey({
    tenantId: chunk.tenant,
    checksum: chunk.checksum,
    chunkStrategy: chunk.chunkStrategy,
    enrichLevel: 'L2',
    promptVariant: 'section_l2',
    promptVersion: 'prompt-v1',
    outputSchemaVersion: 'schema-v1',
    modelId: 'gpt-5.2',
  });
  const changedSchema = buildEnrichmentCacheKey({
    tenantId: chunk.tenant,
    checksum: chunk.checksum,
    chunkStrategy: chunk.chunkStrategy,
    enrichLevel: 'L2',
    promptVariant: 'section_l2',
    promptVersion: 'prompt-v1',
    outputSchemaVersion: 'schema-v2',
    modelId: 'gpt-5.2',
  });

  assert.notEqual(base, changedSchema);
});

test('executor uses cache hits to avoid provider calls', async () => {
  const cacheRepository = createInMemoryEnrichmentCacheRepository();
  const chunk = makeChunk('chunk-1');

  let providerCalls = 0;
  const firstPass = await executeEnrichment([chunk], {
    executionMode: 'full_ingestion',
    runDefaultEnrichLevel: 'L2',
    cacheRepository,
    modelId: 'gpt-5.2',
    promptVersion: 'prompt-v1',
    outputSchemaVersion: 'schema-v1',
    provider: {
      enrichChunk: async () => {
        providerCalls += 1;
        return {
          title: 'Cached title',
          summary: 'Cached summary',
          keywords: ['policy'],
        };
      },
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(firstPass.metrics.enrichCacheMisses, 1);

  const secondPass = await executeEnrichment([chunk], {
    executionMode: 'full_ingestion',
    runDefaultEnrichLevel: 'L2',
    cacheRepository,
    modelId: 'gpt-5.2',
    promptVersion: 'prompt-v1',
    outputSchemaVersion: 'schema-v1',
    provider: {
      enrichChunk: async () => {
        providerCalls += 1;
        throw new Error('provider should not be called on cache hit');
      },
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(secondPass.metrics.enrichCacheHits, 1);
  assert.equal(secondPass.chunks[0]?.title, 'Cached title');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
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

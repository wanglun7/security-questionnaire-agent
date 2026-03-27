import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';

test('chunk contract supports governance fields required by enterprise spec', () => {
  const chunk: ChunkContract = {
    chunkId: 'chunk-1',
    documentId: 'document-1',
    rawTextRef: 'blob://chunk-1',
    cleanText: 'clean text',
    chunkStrategy: 'section',
    span: { paragraphStart: 1, paragraphEnd: 1 },
    reviewStatus: 'pending',
    indexStatus: 'pending',
    metadataVersion: 1,
    tenant: 'tenant-a',
    checksum: 'checksum-1',
    aclTags: ['internal'],
    authorityLevel: 'medium',
    authorityGuess: 'high',
  };

  assert.equal(chunk.indexStatus, 'pending');
  assert.equal(chunk.tenant, 'tenant-a');
  assert.deepEqual(chunk.aclTags, ['internal']);
  assert.equal(chunk.authorityGuess, 'high');
});

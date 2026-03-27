import test from 'node:test';
import assert from 'node:assert/strict';

import { validateChunks } from '../../../lib/ingestion/services/validation';

test('validation flags empty clean text and missing source span', () => {
  const result = validateChunks([
    {
      chunkId: 'chunk_1',
      documentId: 'doc_1',
      tenant: 'tenant-default',
      rawTextRef: 'blob://1',
      cleanText: '',
      aclTags: [],
      checksum: 'checksum-1',
      reviewStatus: 'pending',
      indexStatus: 'pending',
      chunkStrategy: 'section',
      span: {},
      metadataVersion: 1,
    },
  ]);

  assert.equal(result.length, 3);
  assert.equal(result[0]?.requiresHumanReview, true);
  assert.equal(result[0]?.validationTier, 'hard_fail');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateChunks } from '../../../lib/ingestion/services/validation';

test('validation flags empty clean text and missing source span', () => {
  const result = validateChunks([
    {
      chunkId: 'chunk_1',
      documentId: 'doc_1',
      rawTextRef: 'blob://1',
      cleanText: '',
      reviewStatus: 'pending',
      chunkStrategy: 'section',
      span: {},
      metadataVersion: 1,
    },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0]?.requiresHumanReview, true);
});

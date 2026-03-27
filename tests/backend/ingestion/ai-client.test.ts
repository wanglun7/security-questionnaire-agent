import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOpenAIBaseUrl } from '../../../lib/ai/client';

test('normalizeOpenAIBaseUrl appends /v1 for bare gateway roots', () => {
  assert.equal(
    normalizeOpenAIBaseUrl('http://154.17.30.28:8080'),
    'http://154.17.30.28:8080/v1'
  );
});

test('normalizeOpenAIBaseUrl preserves urls that already include /v1', () => {
  assert.equal(
    normalizeOpenAIBaseUrl('http://154.17.30.28:8080/v1'),
    'http://154.17.30.28:8080/v1'
  );
});

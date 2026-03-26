import test from 'node:test';
import assert from 'node:assert/strict';

import { runIngestionSmoke } from '../../../scripts/run-ingestion-smoke';

test('smoke script helper is exposed', () => {
  assert.equal(typeof runIngestionSmoke, 'function');
});

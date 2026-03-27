import test from 'node:test';
import assert from 'node:assert/strict';

import { runIngestionSmoke } from '../../../scripts/run-ingestion-smoke';

test('smoke script helper is exposed', () => {
  assert.equal(typeof runIngestionSmoke, 'function');
});

test('smoke script closes resources in real mode', async () => {
  let closed = false;

  const result = await runIngestionSmoke({
    useRealEnv: true,
    graphFactory: async () =>
      ({
        invoke: async () => ({
          status: 'INDEXED',
          chunks: [{ chunkId: 'c1' }],
        }),
      }) as any,
    closeResources: async () => {
      closed = true;
    },
  });

  assert.equal(result.status, 'INDEXED');
  assert.equal(closed, true);
});

test('smoke script runs in isolated mode with an explicit decision provider', async () => {
  const result = await runIngestionSmoke({
    useRealEnv: false,
  });

  assert.equal(result.status, 'INDEXED');
  assert.ok(result.chunks?.length);
});

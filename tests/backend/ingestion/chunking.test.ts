import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChunkTasks } from '../../../lib/ingestion/services/chunking';

test('chunking service creates one task per row-like section', () => {
  const tasks = buildChunkTasks({
    documentId: 'doc_1',
    chunkingStrategy: 'row',
    sections: [
      {
        sectionId: 's1',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'r1',
        span: { rowStart: 1, rowEnd: 1 },
      },
      {
        sectionId: 's2',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'r2',
        span: { rowStart: 2, rowEnd: 2 },
      },
    ],
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.chunkingStrategy, 'row');
});

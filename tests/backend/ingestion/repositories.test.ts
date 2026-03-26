import test from 'node:test';
import assert from 'node:assert/strict';

import * as schema from '../../../lib/db/schema';

test('ingestion schema exports core knowledge tables', () => {
  assert.ok(schema.documents);
  assert.ok(schema.documentSections);
  assert.ok(schema.knowledgeChunks);
  assert.ok(schema.ingestionRuns);
  assert.ok(schema.ingestionStepTraces);
  assert.ok(schema.reviewTasks);
});

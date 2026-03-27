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

test('knowledge chunks schema exposes governance columns', () => {
  assert.ok(schema.knowledgeChunks.tenant);
  assert.ok(schema.knowledgeChunks.indexStatus);
  assert.ok(schema.knowledgeChunks.checksum);
  assert.ok(schema.knowledgeChunks.authorityLevel);
  assert.ok(schema.knowledgeChunks.aclTagsJson);
});

test('review tasks schema exposes lifecycle columns', () => {
  assert.ok(schema.reviewTasks.taskType);
  assert.ok(schema.reviewTasks.reasonCodesJson);
  assert.ok(schema.reviewTasks.targetChunkIdsJson);
  assert.ok(schema.reviewTasks.resolutionType);
  assert.ok(schema.reviewTasks.resolvedAt);
});

test('ingestion runs schema supports partial indexing status bookkeeping', () => {
  assert.ok(schema.ingestionRuns.status);
  assert.ok(schema.ingestionRuns.metricsJson);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReviewTaskContract } from '../../../lib/ingestion/contracts/review';

test('review task contract supports enterprise lifecycle fields', () => {
  const task: ReviewTaskContract = {
    reviewTaskId: 'review-1',
    ingestionId: 'ingestion-1',
    documentId: 'document-1',
    taskType: 'chunk_review',
    reasonCodes: ['POSSIBLE_PROMPT_INJECTION'],
    targetChunkIds: ['chunk-1', 'chunk-2'],
    summary: 'needs review',
    suggestedAction: 'approve',
    status: 'pending',
    resolutionType: 'approved',
  };

  assert.deepEqual(task.targetChunkIds, ['chunk-1', 'chunk-2']);
  assert.equal(task.taskType, 'chunk_review');
});

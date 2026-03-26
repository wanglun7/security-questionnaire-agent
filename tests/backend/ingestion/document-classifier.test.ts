import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyDocument } from '../../../lib/ingestion/services/document-classifier';

test('classifier maps xlsx questionnaire to row chunking', async () => {
  const result = await classifyDocument({
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalFilename: 'security-questionnaire.xlsx',
    previewText: '问题列\n是否支持SSO',
  });

  assert.equal(result.docType, 'questionnaire');
  assert.equal(result.chunkingStrategy, 'row');
  assert.equal(result.parserStrategy, 'xlsx');
});

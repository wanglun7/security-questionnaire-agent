import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadSourceDescriptorNode } from '../../../lib/ingestion/graph/nodes/load-source-descriptor';

const fixturesDir = path.join(process.cwd(), 'tests/fixtures/ingestion-spec-samples');

test('source descriptor extracts semantic preview text from docx sample', async () => {
  const result = await loadSourceDescriptorNode({
    ingestionId: 'ingestion-docx',
    documentId: 'document-docx',
    sourceUri: path.join(fixturesDir, 'section-sample.docx'),
    originalFilename: 'section-sample.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    status: 'RECEIVED',
  } as any);

  assert.ok(result.previewText);
  assert.match(result.previewText!, /Sample Document/i);
  assert.match(result.previewText!, /Headings/i);
});

test('source descriptor extracts semantic preview text from xlsx sample', async () => {
  const result = await loadSourceDescriptorNode({
    ingestionId: 'ingestion-xlsx',
    documentId: 'document-xlsx',
    sourceUri: path.join(fixturesDir, 'row-sample.xlsx'),
    originalFilename: 'row-sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'RECEIVED',
  } as any);

  assert.ok(result.previewText);
  assert.match(result.previewText!, /Sheet1/i);
  assert.match(result.previewText!, /Months/i);
});

test('source descriptor extracts semantic preview text from pdf sample', async () => {
  const result = await loadSourceDescriptorNode({
    ingestionId: 'ingestion-pdf',
    documentId: 'document-pdf',
    sourceUri: path.join(fixturesDir, 'clause-sample.pdf'),
    originalFilename: 'clause-sample.pdf',
    mimeType: 'application/pdf',
    status: 'RECEIVED',
  } as any);

  assert.ok(result.previewText);
  assert.match(result.previewText!, /MUTUAL NON-DISCLOSURE AGREEMENT/i);
  assert.match(result.previewText!, /NOW, THEREFORE/i);
});

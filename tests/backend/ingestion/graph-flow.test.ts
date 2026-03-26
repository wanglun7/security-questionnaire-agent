import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { parseXlsxDocument } from '../../../lib/ingestion/services/parsers/xlsx';

test('xlsx parser normalizes rows into row_block sections', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['问题'],
    ['是否支持SSO'],
    ['是否支持MFA'],
  ]);

  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const result = await parseXlsxDocument({
    documentId: 'doc_1',
    sourceUri: tmpFile,
  });

  await fs.unlink(tmpFile);

  assert.equal(result.sections[0]?.kind, 'row_block');
  assert.equal(result.document.documentId, 'doc_1');
  assert.equal(result.sections.length, 3);
});

test('ingestion graph compiles and reaches INDEXED on a simple xlsx input', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-graph-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['问题'],
    ['是否支持SSO'],
  ]);

  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const graph = await createIngestionGraph({ checkpointer: false });
  const result = await graph.invoke({
    ingestionId: 'ing_1',
    documentId: 'doc_1',
    sourceUri: tmpFile,
    originalFilename: 'sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'RECEIVED',
  });

  await fs.unlink(tmpFile);

  assert.equal(result.status, 'INDEXED');
  assert.ok(result.chunks?.length);
});

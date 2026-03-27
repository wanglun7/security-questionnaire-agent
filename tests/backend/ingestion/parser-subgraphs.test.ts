import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';

import { createXlsxParserSubgraph } from '../../../lib/ingestion/graph/subgraphs/xlsx-parser';

test('xlsx parser subgraph is independently invokable', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-subgraph-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['问题'], ['是否支持SSO']]), 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const subgraph = createXlsxParserSubgraph();
  const result = await subgraph.invoke({
    documentId: '17171717-1717-4717-8717-171717171717',
    sourceUri: tmpFile,
  });

  await fs.unlink(tmpFile);

  assert.equal(result.document.documentId, '17171717-1717-4717-8717-171717171717');
  assert.equal(result.sections[0]?.kind, 'row_block');
});

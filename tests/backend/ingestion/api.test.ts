import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';
import { MemorySaver } from '@langchain/langgraph';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { getIngestionState } from '../../../lib/ingestion/api/get-ingestion-state';
import { startIngestion } from '../../../lib/ingestion/api/start-ingestion';

test('startIngestion returns ingestion id and final status', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-api-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['问题'], ['是否支持SSO']]), 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const graph = await createIngestionGraph({
    checkpointer: new MemorySaver(),
  });

  const result = await startIngestion(
    {
      documentId: 'doc_1',
      sourceUri: tmpFile,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalFilename: 'api.xlsx',
    },
    {
      graph,
      idFactory: () => 'ing_api_1',
    }
  );

  const snapshot = await getIngestionState('ing_api_1', { graph });

  await fs.unlink(tmpFile);

  assert.equal(result.ingestionId, 'ing_api_1');
  assert.equal(result.status, 'INDEXED');
  assert.equal((snapshot.values as { status?: string }).status, 'INDEXED');
});

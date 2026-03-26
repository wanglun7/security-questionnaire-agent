import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';

import { createIngestionGraph } from '../lib/ingestion/graph/builder';

export async function runIngestionSmoke() {
  const tmpFile = path.join(os.tmpdir(), `ingestion-smoke-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['问题'],
    ['是否支持SSO'],
    ['是否支持MFA'],
  ]);

  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  try {
    const graph = await createIngestionGraph({ checkpointer: false });
    const result = await graph.invoke({
      ingestionId: `ing-smoke-${Date.now()}`,
      documentId: 'doc-smoke',
      sourceUri: tmpFile,
      originalFilename: 'smoke.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      status: 'RECEIVED',
    });

    console.log(JSON.stringify({
      status: result.status,
      chunkCount: result.chunks?.length ?? 0,
    }));

    return result;
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
  }
}

if (require.main === module) {
  runIngestionSmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

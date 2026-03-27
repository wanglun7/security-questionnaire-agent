import test from 'node:test';
import assert from 'node:assert/strict';

import { createFinalizeReportNode } from '../../../lib/ingestion/graph/nodes/finalize-report';

test('run finalizes as PARTIALLY_INDEXED when only some chunks are indexed', async () => {
  const node = createFinalizeReportNode({
    async saveIngestionRunResult() {},
    async saveIngestionArtifacts() {},
    async saveChunkEmbeddings() {},
  });

  const result = await node({
    ingestionId: '60606060-6060-4060-8060-606060606060',
    documentId: '70707070-7070-4070-8070-707070707070',
    sourceUri: '/tmp/a.xlsx',
    originalFilename: 'a.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'INDEXING',
    chunks: [
      {
        chunkId: '80808080-8080-4080-8080-808080808080',
        documentId: '70707070-7070-4070-8070-707070707070',
        tenant: 'tenant-default',
        rawTextRef: 'approved',
        cleanText: 'approved',
        aclTags: [],
        checksum: 'checksum-approved',
        reviewStatus: 'approved',
        indexStatus: 'indexed',
        chunkStrategy: 'row',
        span: { rowStart: 1, rowEnd: 1, sheetName: 'Sheet1' },
        metadataVersion: 1,
      },
      {
        chunkId: '90909090-9090-4090-8090-909090909090',
        documentId: '70707070-7070-4070-8070-707070707070',
        tenant: 'tenant-default',
        rawTextRef: 'rejected',
        cleanText: 'rejected',
        aclTags: [],
        checksum: 'checksum-rejected',
        reviewStatus: 'rejected',
        indexStatus: 'rejected',
        chunkStrategy: 'row',
        span: { rowStart: 2, rowEnd: 2, sheetName: 'Sheet1' },
        metadataVersion: 1,
      },
    ],
  });

  assert.equal(result.status, 'PARTIALLY_INDEXED');
});

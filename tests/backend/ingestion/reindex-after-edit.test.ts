import test from 'node:test';
import assert from 'node:assert/strict';

import { Command, MemorySaver } from '@langchain/langgraph';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { createTestDecisionProvider } from './helpers/test-decision-provider';

test('editing metadata bumps metadata version and marks chunk for reindex', async () => {
  const ingestionId = '20202020-2020-4020-8020-202020202020';
  const documentId = '30303030-3030-4030-8030-303030303030';
  const chunkId = '40404040-4040-4040-8040-404040404040';

  const graph = await createIngestionGraph({
    checkpointer: new MemorySaver(),
    decisionProvider: createTestDecisionProvider(),
    storage: {
      async saveDraftArtifacts() {},
      async saveChunkEmbeddings() {},
      async publishIndexedChunks() {},
    } as any,
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });

  const config = { configurable: { thread_id: ingestionId } };

  const interrupted = await graph.invoke(
    {
      ingestionId,
      documentId,
      sourceUri: '/tmp/unused',
      originalFilename: 'manual.html',
      mimeType: 'text/html',
      status: 'RECEIVED',
      parserStrategy: 'html',
      chunkingStrategy: 'section',
      document: {
        documentId,
        sourceUri: '/tmp/unused',
        mimeType: 'text/html',
      },
      sections: [
        {
          sectionId: '11111111-2222-4333-8444-555555555555',
          documentId,
          kind: 'paragraph_block',
          textRef: 'Original question',
          span: { paragraphStart: 1, paragraphEnd: 1 },
        },
      ],
      chunks: [
        {
          chunkId,
          documentId,
          tenant: 'tenant-default',
          rawTextRef: 'Original question',
          cleanText: 'Original question',
          title: 'Original question',
          summary: 'Original summary',
          aclTags: [],
          checksum: 'checksum-edit',
          reviewStatus: 'review_required',
          indexStatus: 'pending',
          chunkStrategy: 'section',
          span: { paragraphStart: 1, paragraphEnd: 1 },
          metadataVersion: 1,
        },
      ],
      reviewTasks: [
        {
          reviewTaskId: '50505050-5050-4050-8050-505050505050',
          ingestionId,
          documentId,
          taskType: 'metadata_review',
          reasonCodes: ['LOW_METADATA_QUALITY'],
          targetDocumentId: documentId,
          targetChunkIds: [chunkId],
          scope: 'chunk',
          scopeRefId: chunkId,
          reasonCode: 'LOW_METADATA_QUALITY',
          summary: 'needs metadata edit',
          suggestedAction: 'edit',
        },
      ],
    },
    config
  );

  assert.ok((interrupted as { __interrupt__?: unknown }).__interrupt__);

  const resumed = await graph.invoke(
    new Command({
      resume: {
        action: 'edit_chunk_metadata',
        chunkId,
        metadata: {
          summary: 'Updated summary',
        },
      },
    }),
    config
  );

  assert.equal(resumed.chunks?.[0]?.metadataVersion, 2);
  assert.equal(resumed.chunks?.[0]?.indexStatus, 'indexed');
  assert.equal(resumed.reviewTasks?.[0]?.resolutionType, 'edited');
  assert.ok(resumed.reviewTasks?.[0]?.resolvedAt);
  assert.equal(
    (resumed.reviewTasks?.[0]?.resolutionJson as { diffs?: Array<{ requiresReindex?: boolean }> })
      ?.diffs?.[0]?.requiresReindex,
    true
  );
});

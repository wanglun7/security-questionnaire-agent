import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersistChunksNode } from '../../../lib/ingestion/graph/nodes/persist-chunks';
import { createWriteVectorIndexNode } from '../../../lib/ingestion/graph/nodes/write-vector-index';
import { enrichChunk } from '../../../lib/ingestion/services/enrichment';

const INGESTION_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const SECTION_ID = '33333333-3333-4333-8333-333333333333';
const CHUNK_ID = '44444444-4444-4444-8444-444444444444';
const REVIEW_TASK_ID = '55555555-5555-4555-8555-555555555555';

test('persistChunksNode writes document sections chunks and review tasks through storage', async () => {
  const calls: string[] = [];

  const node = createPersistChunksNode({
    saveDraftArtifacts: async (input: {
      document: { documentId: string };
      sections: unknown[];
      chunks: unknown[];
      reviewTasks: unknown[];
      ingestionId?: string;
      parserStrategy?: string;
      chunkingStrategy?: string;
      status?: string;
    }) => {
      calls.push('saveDraftArtifacts');
      assert.equal(input.document.documentId, DOCUMENT_ID);
      assert.equal(input.sections.length, 1);
      assert.equal(input.chunks.length, 1);
      assert.equal(input.reviewTasks.length, 1);
    },
    saveChunkEmbeddings: async () => {
      throw new Error('not used');
    },
  });

  const result = await node({
    ingestionId: INGESTION_ID,
    documentId: DOCUMENT_ID,
    sourceUri: '/tmp/a.xlsx',
    originalFilename: 'a.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'VALIDATED',
    parserStrategy: 'xlsx',
    chunkingStrategy: 'row',
    document: {
      documentId: DOCUMENT_ID,
      sourceUri: '/tmp/a.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    sections: [
      {
        sectionId: SECTION_ID,
        documentId: DOCUMENT_ID,
        kind: 'row_block',
        textRef: '是否支持SSO',
        span: { sheetName: 'Sheet1', rowStart: 1, rowEnd: 1 },
      },
    ],
    chunks: [
      {
        chunkId: CHUNK_ID,
        documentId: DOCUMENT_ID,
        sectionId: SECTION_ID,
        tenant: 'tenant-default',
        rawTextRef: '是否支持SSO',
        cleanText: '是否支持SSO',
        aclTags: [],
        checksum: 'checksum-1',
        reviewStatus: 'approved',
        indexStatus: 'pending',
        chunkStrategy: 'row',
        span: { sheetName: 'Sheet1', rowStart: 1, rowEnd: 1 },
        metadataVersion: 1,
      },
    ],
    reviewTasks: [
      {
        reviewTaskId: REVIEW_TASK_ID,
        ingestionId: INGESTION_ID,
        documentId: DOCUMENT_ID,
        taskType: 'chunk_review',
        reasonCodes: ['POSSIBLE_PROMPT_INJECTION'],
        targetDocumentId: DOCUMENT_ID,
        targetChunkIds: [CHUNK_ID],
        scope: 'chunk',
        scopeRefId: CHUNK_ID,
        reasonCode: 'POSSIBLE_PROMPT_INJECTION',
        summary: 'needs review',
        suggestedAction: 'approve',
      },
    ],
  });

  assert.deepEqual(calls, ['saveDraftArtifacts']);
  assert.equal(result.status, 'REVIEW_REQUIRED');
});

test('enrichment fills governance-ready metadata fields', async () => {
  await assert.rejects(
    enrichChunk({
      chunkId: 'chunk-enrich',
      documentId: DOCUMENT_ID,
      tenant: 'tenant-a',
      rawTextRef: 'Does the product support SSO?',
      cleanText: 'Does the product support SSO?',
      chunkStrategy: 'faq',
      span: { paragraphStart: 1, paragraphEnd: 1 },
      reviewStatus: 'pending',
      indexStatus: 'pending',
      metadataVersion: 1,
      checksum: 'chunk-enrich',
      aclTags: [],
      authorityLevel: 'low',
    }),
    /LLM decision provider is required for chunk enrichment/i
  );
});

test('enrichment can use structured LLM metadata output when provider is supplied', async () => {
  const result = await enrichChunk(
    {
      chunkId: 'chunk-enrich-llm',
      documentId: DOCUMENT_ID,
      tenant: 'tenant-a',
      rawTextRef: 'Does the product support SCIM?',
      cleanText: 'Does the product support SCIM?',
      chunkStrategy: 'faq',
      span: { paragraphStart: 1, paragraphEnd: 1 },
      reviewStatus: 'pending',
      indexStatus: 'pending',
      metadataVersion: 1,
      checksum: 'chunk-enrich-llm',
      aclTags: [],
      authorityLevel: 'low',
    },
    {
      provider: {
        enrichChunk: async () => ({
          title: 'SCIM support',
          summary: 'The chunk discusses SCIM support.',
          keywords: ['scim', 'support'],
          entities: ['SCIM'],
          questionsAnswered: ['Does the product support SCIM?'],
          authorityLevel: 'high',
          reviewHints: ['llm_enriched'],
        }),
      },
    }
  );

  assert.equal(result.title, 'SCIM support');
  assert.deepEqual(result.keywords, ['scim', 'support']);
  assert.equal(result.authorityLevel, 'high');
});

test('enrichment surfaces provider failures instead of falling back', async () => {
  await assert.rejects(
    enrichChunk(
      {
        chunkId: 'chunk-enrich-fail',
        documentId: DOCUMENT_ID,
        tenant: 'tenant-a',
        rawTextRef: 'Does the product support SCIM?',
        cleanText: 'Does the product support SCIM?',
        chunkStrategy: 'faq',
        span: { paragraphStart: 1, paragraphEnd: 1 },
        reviewStatus: 'pending',
        indexStatus: 'pending',
        metadataVersion: 1,
        checksum: 'chunk-enrich-fail',
        aclTags: [],
      },
      {
        provider: {
          enrichChunk: async () => {
            throw new Error('metadata llm failed');
          },
        },
      }
    ),
    /metadata llm failed/i
  );
});

test('persist step can save draft artifacts before final indexing', async () => {
  let draftSaved = false;

  const node = createPersistChunksNode({
    saveDraftArtifacts: async () => {
      draftSaved = true;
    },
    saveChunkEmbeddings: async () => {
      throw new Error('not used');
    },
  } as any);

  await node({
    ingestionId: INGESTION_ID,
    documentId: DOCUMENT_ID,
    sourceUri: '/tmp/a.xlsx',
    originalFilename: 'a.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'REVIEW_REQUIRED',
    document: {
      documentId: DOCUMENT_ID,
      sourceUri: '/tmp/a.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });

  assert.equal(draftSaved, true);
});

test('writeVectorIndexNode generates embeddings and writes only indexable chunks', async () => {
  const embeddedTexts: string[] = [];
  let writtenEmbeddings:
    | Array<{ chunkId: string; embedding: number[] }>
    | undefined;

  const node = createWriteVectorIndexNode({
    generateEmbeddingFn: async (text: string) => {
      embeddedTexts.push(text);
      return [0.1, 0.2, 0.3];
    },
    storage: {
      saveDraftArtifacts: async () => {
        throw new Error('not used');
      },
      saveChunkEmbeddings: async (embeddings: Array<{ chunkId: string; embedding: number[] }>) => {
        writtenEmbeddings = embeddings;
      },
      publishIndexedChunks: async () => {},
    },
  });

  const result = await node({
    ingestionId: INGESTION_ID,
    documentId: DOCUMENT_ID,
    sourceUri: '/tmp/a.xlsx',
    originalFilename: 'a.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'VALIDATED',
    chunks: [
      {
        chunkId: CHUNK_ID,
        documentId: DOCUMENT_ID,
        tenant: 'tenant-default',
        rawTextRef: 'raw',
        cleanText: '是否支持SSO',
        summary: '支持SSO',
        aclTags: [],
        checksum: 'checksum-2',
        reviewStatus: 'approved',
        indexStatus: 'pending',
        chunkStrategy: 'row',
        span: { sheetName: 'Sheet1', rowStart: 1, rowEnd: 1 },
        metadataVersion: 1,
      },
      {
        chunkId: '66666666-6666-4666-8666-666666666666',
        documentId: DOCUMENT_ID,
        tenant: 'tenant-default',
        rawTextRef: 'raw2',
        cleanText: '敏感内容',
        aclTags: [],
        checksum: 'checksum-3',
        reviewStatus: 'review_required',
        indexStatus: 'pending',
        chunkStrategy: 'row',
        span: { sheetName: 'Sheet1', rowStart: 2, rowEnd: 2 },
        metadataVersion: 1,
      },
    ],
  });

  assert.deepEqual(embeddedTexts, ['是否支持SSO\n\n支持SSO']);
  assert.deepEqual(writtenEmbeddings, [
    { chunkId: CHUNK_ID, embedding: [0.1, 0.2, 0.3] },
  ]);
  assert.equal(result.metrics?.totalChunks, 1);
  assert.equal(result.status, 'INDEXING');
  assert.equal(result.chunks?.[0]?.indexStatus, 'indexed');
  assert.equal(result.chunks?.[1]?.indexStatus, 'pending');
});

test('writeVectorIndexNode bounds embedding concurrency instead of firing all requests at once', async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const node = createWriteVectorIndexNode({
    generateEmbeddingFn: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return [0.1, 0.2, 0.3];
    },
    storage: {
      saveDraftArtifacts: async () => {
        throw new Error('not used');
      },
      saveChunkEmbeddings: async () => {},
      publishIndexedChunks: async () => {},
    },
  });

  await node({
    ingestionId: INGESTION_ID,
    documentId: DOCUMENT_ID,
    sourceUri: '/tmp/a.xlsx',
    originalFilename: 'a.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'VALIDATED',
    chunks: Array.from({ length: 6 }, (_, index) => ({
      chunkId: `${index + 1}`.repeat(8).slice(0, 8) + '-1111-4111-8111-111111111111',
      documentId: DOCUMENT_ID,
      tenant: 'tenant-default',
      rawTextRef: `raw-${index}`,
      cleanText: `Chunk ${index} text`,
      summary: `Chunk ${index} summary`,
      aclTags: [],
      checksum: `checksum-${index}`,
      reviewStatus: 'approved' as const,
      indexStatus: 'pending' as const,
      chunkStrategy: 'section' as const,
      span: { paragraphStart: index + 1, paragraphEnd: index + 1 },
      metadataVersion: 1,
    })),
  });

  assert.ok(maxInFlight <= 3);
});

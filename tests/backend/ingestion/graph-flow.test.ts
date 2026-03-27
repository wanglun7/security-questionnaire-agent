import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { parseDocxDocument } from '../../../lib/ingestion/services/parsers/docx';
import { parseHtmlDocument } from '../../../lib/ingestion/services/parsers/html';
import { parsePdfDocument } from '../../../lib/ingestion/services/parsers/pdf';
import { extractPdfLayoutWithPyMuPdf } from '../../../lib/ingestion/services/parsers/pymupdf';
import {
  parseXlsxDocument,
  resolveEffectiveSheetRange,
  XLSX_ROW_BATCH_SIZE,
} from '../../../lib/ingestion/services/parsers/xlsx';
import { MemorySaver } from '@langchain/langgraph';
import { createTestDecisionProvider } from './helpers/test-decision-provider';

const INGESTION_ID = '77777777-7777-4777-8777-777777777777';
const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888';
const fixturesDir = path.join(process.cwd(), 'tests/fixtures/ingestion-spec-samples');

const testStorage = {
  async saveIngestionArtifacts() {},
  async saveChunkEmbeddings() {},
};

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
    documentId: DOCUMENT_ID,
    sourceUri: tmpFile,
  });

  await fs.unlink(tmpFile);

  assert.equal(result.sections[0]?.kind, 'row_block');
  assert.equal(result.document.documentId, DOCUMENT_ID);
  assert.equal(result.sections.length, 3);
});

test('xlsx parser collapses dirty worksheet dimensions to populated cells', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Categoria', 'ID'],
    ['Acessorios > Aro 13', 'MLB22736'],
    ['Acessorios > Aro 14', 'MLB46657'],
  ]);

  sheet['!ref'] = 'A1:XFD138739';

  assert.equal(resolveEffectiveSheetRange(sheet), 'A1:B3');
});

test('xlsx parser handles large worksheets without dropping populated rows', async () => {
  const startedAt = Date.now();
  const result = await parseXlsxDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/vtex-help-center-repo/docs/en/faq/channels/MercadoLivre_CategoriasFixas.xlsx'
    ),
  });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.document.sectionCount, 138739);
  assert.equal(result.sections[0]?.textRef, 'Categoria | ID');
  assert.match(result.sections[1]?.textRef ?? '', /MLB22736/);
  assert.ok((result.sections.length ?? 0) <= 500);
  assert.ok(result.rowBatchPlan);
  assert.equal(result.rowBatchPlan?.totalRows, 138739);
  assert.ok((result.rowBatchPlan?.totalBatches ?? 0) > 100);
  assert.ok(
    result.rowBatchPlan?.batches.every((batch) => batch.nonEmptyRowCount <= XLSX_ROW_BATCH_SIZE)
  );
  assert.ok(elapsedMs < 5000);
});

test('xlsx parser samples sections for very large row-heavy workbooks', async () => {
  const result = await parseXlsxDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/vtex-help-center-repo/docs/en/faq/channels/MercadoLivre_CategoriasFixas.xlsx'
    ),
  });

  assert.equal(result.document.sectionCount, 138739);
  assert.ok(result.sections.length < result.document.sectionCount);
  assert.ok(result.sections.length <= 500);
});

test('docx parser emits normalized section kinds for downstream chunk strategy selection', async () => {
  const result = await parseDocxDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'node_modules/mammoth/test/test-data/embedded-style-map.docx'
    ),
  });

  assert.ok(result.sections.some((section) => section.kind === 'heading'));
  assert.ok(result.sections.some((section) => section.kind === 'heading' && typeof section.level === 'number'));
  assert.ok(result.sections.every((section) => section.kind));
});

test('html parser preserves heading and table structure signals', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-html-${Date.now()}.html`);
  await fs.writeFile(
    tmpFile,
    '<html><body><h1>Security</h1><p>Supports SSO and MFA.</p><table><tr><td>Control</td><td>Status</td></tr></table></body></html>',
    'utf8'
  );

  const result = await parseHtmlDocument({
    documentId: DOCUMENT_ID,
    sourceUri: tmpFile,
  });

  await fs.unlink(tmpFile);

  assert.ok(result.sections.some((section) => section.kind === 'heading'));
  assert.ok(result.sections.some((section) => section.kind === 'heading' && section.level === 1));
  assert.ok(result.sections.some((section) => section.kind === 'table'));
  assert.ok(result.sections.some((section) => section.kind === 'paragraph_block'));
});

test('html parser emits faq_block sections for faq-like html fixtures', async () => {
  const result = await parseHtmlDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(fixturesDir, 'faq-sample.html'),
  });

  assert.ok(result.sections.some((section) => section.kind === 'faq_block'));
});

test('html faq parsing drops navigation and contribution boilerplate from faq blocks', async () => {
  const result = await parseHtmlDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(fixturesDir, 'faq-sample.html'),
  });

  const faqBlocks = result.sections.filter((section) => section.kind === 'faq_block');

  assert.ok(faqBlocks.length > 0);
  assert.ok(
    faqBlocks.every(
      (section) =>
        !/Found A Problem\?|Learn How To Improve This Page|User Contributed Notes|Add to my favorites/i.test(
          section.textRef
        )
    )
  );
});

test('html faq parsing starts from the actual faq content instead of site navigation', async () => {
  const result = await parseHtmlDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(fixturesDir, 'faq-sample.html'),
  });

  const firstFaqBlock = result.sections.find((section) => section.kind === 'faq_block');

  assert.ok(firstFaqBlock);
  assert.match(firstFaqBlock?.textRef ?? '', /What is PHP\?/);
  assert.doesNotMatch(firstFaqBlock?.textRef ?? '', /Downloads|Documentation|Get Involved|Next menu item/i);
});

test('pdf parser emits clause_block sections for clause-heavy fixtures', async () => {
  const result = await parsePdfDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(fixturesDir, 'clause-sample.pdf'),
  });

  assert.ok(result.sections.some((section) => section.kind === 'clause_block'));
});

test('pdf parser preserves headings and avoids faq blocks for handbook-style pdfs', async () => {
  const result = await parsePdfDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/hr-manual/hr-manual-master/pdf/manual.pdf'
    ),
  });

  assert.ok(result.sections.some((section) => section.kind === 'heading'));
  assert.ok(result.sections.some((section) => section.kind === 'heading' && /Policy Manual/i.test(section.textRef)));
  assert.equal(result.sections.some((section) => section.kind === 'faq_block'), false);
});

test('pdf parser keeps metadata lines as paragraph blocks when style matches body text', async () => {
  const result = await parsePdfDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/hr-manual/hr-manual-master/pdf/manual.pdf'
    ),
  });

  const lastUpdated = result.sections.find((section) => /Last Updated: 2018-01-08/i.test(section.textRef));

  assert.ok(lastUpdated);
  assert.equal(lastUpdated?.kind, 'paragraph_block');
});

test('pdf parser keeps handbook headings close to source structure', async () => {
  const result = await parsePdfDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/hr-manual/hr-manual-master/pdf/manual.pdf'
    ),
  });

  const headings = result.sections
    .filter((section) => section.kind === 'heading')
    .map((section) => section.textRef);

  assert.ok(headings.includes('Contact with the Media'));
  assert.ok(headings.includes('Professional Development'));
  assert.equal(headings.some((heading) => /^Travel - In Town/i.test(heading)), false);
  assert.equal(headings.some((heading) => /management:\s+Executive Director/i.test(heading)), false);
});

test('pdf parser drops exported help-center metadata boilerplate blocks', async () => {
  const result = await parsePdfDocument({
    documentId: DOCUMENT_ID,
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/vtex-help-center-repo/docs/pt/tutorials/integrações/configurações-de-integrações/Tutorial_de_Aux_lio_ao_parceiro.pdf'
    ),
  });

  const texts = result.sections.slice(0, 6).map((section) => section.textRef);

  assert.equal(texts.some((text) => /Last updated by/i.test(text)), false);
  assert.equal(texts.some((text) => /\d{2}\/\d{2}\/\d{4}.*Overview/i.test(text)), false);
  assert.ok(result.sections.some((section) => /Tutorial de auxílio ao Parceiro VTEX/i.test(section.textRef)));
});

test('pymupdf helper resolves script path independent of current cwd', async () => {
  const originalCwd = process.cwd();
  process.chdir(path.resolve(originalCwd, '..', '..'));

  try {
    const result = await extractPdfLayoutWithPyMuPdf(
      path.join(
        originalCwd,
        'tmp/test-kb-extracts/hr-manual/hr-manual-master/pdf/manual.pdf'
      )
    );

    assert.ok(result.blocks.length > 0);
    assert.ok(result.previewText.includes('Policy Manual'));
  } finally {
    process.chdir(originalCwd);
  }
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

  const safeGraph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
    storage: testStorage,
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });
  const result = await safeGraph.invoke({
    ingestionId: INGESTION_ID,
    documentId: DOCUMENT_ID,
    sourceUri: tmpFile,
    originalFilename: 'sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'RECEIVED',
  });

  await fs.unlink(tmpFile);

  assert.equal(result.status, 'INDEXED');
  assert.ok(result.chunks?.length);
});

test('strategy-check mode stops after chunking without persistence or indexing', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-graph-strategy-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['问题'],
    ['是否支持SSO'],
  ]);
  let persisted = 0;
  let embedded = 0;

  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
    storage: {
      async saveDraftArtifacts() {
        persisted += 1;
      },
      async saveIngestionArtifacts() {
        persisted += 1;
      },
      async saveChunkEmbeddings() {
        embedded += 1;
      },
    },
    generateEmbeddingFn: async () => {
      embedded += 1;
      return [0.1, 0.2, 0.3];
    },
  });

  const result = await graph.invoke({
    ingestionId: INGESTION_ID,
    documentId: DOCUMENT_ID,
    sourceUri: tmpFile,
    originalFilename: 'sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    executionMode: 'strategy_check',
    status: 'RECEIVED',
  } as any);

  await fs.unlink(tmpFile);

  assert.equal(result.status, 'CHUNKED');
  assert.ok(result.chunks?.length);
  assert.equal(persisted, 0);
  assert.equal(embedded, 0);
});

test('graph resolves parser deterministically and runs semantic classification after parse', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-graph-order-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Question', 'Answer'],
    ['Does the product support SSO?', 'Yes'],
    ['Does the product support MFA?', 'Yes'],
  ]);
  let classifySawParser: string | undefined;
  let classifySawSections = 0;
  let strategySawParser: string | undefined;
  let strategySawDocType: string | undefined;

  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const graph = await createIngestionGraph({
    checkpointer: false,
    storage: testStorage,
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
    decisionProvider: {
      classifyDocument: async (input) => {
        classifySawParser = input.parserStrategy;
        classifySawSections = input.sections.length;
        return {
          docType: 'faq',
          initialChunkingHypothesis: 'faq',
          priorityFeatures: ['faq'],
        };
      },
      chooseChunkStrategy: async (input) => {
        strategySawParser = input.parserStrategy;
        strategySawDocType = input.docType;
        return {
          chunkingStrategy: 'faq',
          confidence: 'high',
          reason: 'faq_block_dominant',
          fallbackStrategy: 'faq',
        };
      },
      enrichChunk: async (chunk) => ({
        title: chunk.cleanText.slice(0, 40),
        summary: chunk.cleanText.slice(0, 120),
        keywords: ['faq'],
        entities: [],
        questionsAnswered: [chunk.cleanText.slice(0, 80)],
        authorityLevel: 'medium',
        reviewHints: [],
      }),
      routeReviewTask: async (input) => ({
        taskType: input.issue.chunkId ? 'chunk_review' : 'document_review',
        reasonCodes: [input.issue.code],
        summary: input.issue.message,
        suggestedAction: 'approve',
      }),
    },
  });

  const result = await graph.invoke({
    ingestionId: '81818181-8181-4181-8181-818181818181',
    documentId: '91919191-9191-4191-8191-919191919191',
    sourceUri: tmpFile,
    originalFilename: 'semantic-faq.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    executionMode: 'strategy_check',
    status: 'RECEIVED',
  } as any);

  await fs.unlink(tmpFile);

  assert.equal(result.parserStrategy, 'xlsx');
  assert.equal(classifySawParser, 'xlsx');
  assert.ok(classifySawSections > 0);
  assert.equal(strategySawParser, 'xlsx');
  assert.equal(strategySawDocType, 'faq');
  assert.equal(result.chunkingStrategy, 'faq');
});

test('large xlsx strategy-check avoids materializing full section and task arrays before chunk output', async () => {
  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
    storage: {
      async saveDraftArtifacts() {},
      async saveIngestionArtifacts() {},
      async saveChunkEmbeddings() {},
    },
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });

  const result = await graph.invoke({
    ingestionId: '40404040-4040-4040-8040-404040404041',
    documentId: '50505050-5050-4050-8050-505050505051',
    executionMode: 'strategy_check',
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/vtex-help-center-repo/docs/en/faq/channels/MercadoLivre_CategoriasFixas.xlsx'
    ),
    originalFilename: 'MercadoLivre_CategoriasFixas.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'RECEIVED',
  } as any);

  assert.equal(result.chunkingStrategy, 'row');
  assert.equal(result.document?.sectionCount, 138739);
  assert.ok((result.sections?.length ?? 0) <= 500);
  assert.ok((result.chunkTasks?.length ?? 0) <= 500);
  assert.ok((result.chunks?.length ?? 0) <= 500);
  assert.ok((result.chunks?.length ?? 0) < (result.document?.sectionCount ?? 0));
});

test('row-heavy full ingestion processes xlsx chunks in bounded batches', async () => {
  const tmpFile = path.join(os.tmpdir(), `ingestion-row-batch-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const rows = Array.from({ length: 2505 }, (_, index) => [
    `Prompt ${index + 100}`,
    `Response ${index + 100}`,
  ]);
  const persistedBatchSizes: number[] = [];
  const publishedBatchSizes: number[] = [];
  const embeddedBatchSizes: number[] = [];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  XLSX.writeFile(workbook, tmpFile);

  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
    storage: {
      async saveDraftArtifacts(input: { chunks: unknown[] }) {
        persistedBatchSizes.push(input.chunks.length);
      },
      async saveChunkEmbeddings(embeddings: Array<{ chunkId: string; embedding: number[] }>) {
        embeddedBatchSizes.push(embeddings.length);
      },
      async publishIndexedChunks(input: { chunks: unknown[] }) {
        publishedBatchSizes.push(input.chunks.length);
      },
    },
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });

  const result = await graph.invoke({
    ingestionId: '61616161-6161-4161-8161-616161616161',
    documentId: '71717171-7171-4171-8171-717171717171',
    sourceUri: tmpFile,
    originalFilename: 'row-heavy.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'RECEIVED',
  } as any, {
    recursionLimit: 128,
  });

  await fs.unlink(tmpFile);

  assert.equal(result.status, 'INDEXED');
  assert.deepEqual(persistedBatchSizes, [1000, 1000, 505]);
  assert.deepEqual(embeddedBatchSizes, [1000, 1000, 505]);
  assert.deepEqual(publishedBatchSizes, [1000, 1000, 505]);
  assert.equal(result.metrics?.indexedChunks, 2505);
  assert.ok((result.chunks?.length ?? 0) <= XLSX_ROW_BATCH_SIZE);
});

test('low-confidence strategy decisions trigger review before enrichment', async () => {
  const ingestionId = '19191919-1919-4919-8919-191919191919';
  const graph = await createIngestionGraph({
    checkpointer: new MemorySaver(),
    storage: {
      async saveDraftArtifacts() {},
      async saveChunkEmbeddings() {
        throw new Error('should not index before strategy review');
      },
    },
    generateEmbeddingFn: async () => {
      throw new Error('should not index before strategy review');
    },
    decisionProvider: {
      chooseChunkStrategy: async () => ({
        chunkingStrategy: 'section',
        confidence: 'low',
        reason: 'fallback_to_section',
        fallbackStrategy: 'section',
      }),
    },
  });

  const config = { configurable: { thread_id: ingestionId } };

  const interrupted = await graph.invoke(
    {
      ingestionId,
      documentId: DOCUMENT_ID,
      sourceUri: '/tmp/unused',
      originalFilename: 'manual.html',
      mimeType: 'text/html',
      status: 'RECEIVED',
      docType: 'policy',
      parserStrategy: 'html',
      initialChunkingHypothesis: 'section',
      document: {
        documentId: DOCUMENT_ID,
        sourceUri: '/tmp/unused',
        mimeType: 'text/html',
      },
      sections: [
        {
          sectionId: '201',
          documentId: DOCUMENT_ID,
          kind: 'heading',
          textRef: 'Overview',
          span: { paragraphStart: 1, paragraphEnd: 1 },
        },
        {
          sectionId: '202',
          documentId: DOCUMENT_ID,
          kind: 'paragraph_block',
          textRef: 'Supports SSO and MFA.',
          span: { paragraphStart: 2, paragraphEnd: 2 },
        },
      ],
    },
    config
  );

  assert.ok((interrupted as { __interrupt__?: unknown }).__interrupt__);

  const snapshot = await graph.getState(config);
  assert.equal(snapshot.values.status, 'REVIEW_REQUIRED');
  assert.equal(snapshot.values.reviewTasks?.[0]?.taskType, 'strategy_review');
  assert.ok(snapshot.values.chunks?.length);
  assert.equal(snapshot.values.chunks?.every((chunk: { summary?: string }) => !chunk.summary), true);
});

test('handbook-style pdf stays on section strategy instead of misrouting to faq', async () => {
  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
    storage: {
      async saveDraftArtifacts() {},
      async saveIngestionArtifacts() {},
      async saveChunkEmbeddings() {},
      async publishIndexedChunks() {},
      async saveStepTrace() {},
      async resolveReviewTasks() {},
      async saveIngestionRunResult() {},
      async ensureIngestionRun() {},
    },
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });

  const result = await graph.invoke({
    ingestionId: '29292929-2929-4929-8929-292929292929',
    documentId: '30303030-3030-4030-8030-303030303030',
    executionMode: 'strategy_check',
    sourceUri: path.join(
      process.cwd(),
      'tmp/test-kb-extracts/hr-manual/hr-manual-master/pdf/manual.pdf'
    ),
    originalFilename: 'manual.pdf',
    mimeType: 'application/pdf',
    status: 'RECEIVED',
  } as any);

  assert.equal(result.parserStrategy, 'pdf');
  assert.equal(result.chunkingStrategy, 'section');
  assert.equal(result.chunkStrategyReason, 'fallback_to_section');
  assert.ok(result.chunks?.length);
});

test('partial enrich failures keep the run healthy and surface enrich metrics in traces and final report', async () => {
  const traces: Array<{ nodeName: string; outputSummary?: Record<string, unknown> }> = [];
  const runResults: Array<{ status: string; metrics?: Record<string, unknown> }> = [];
  let enrichCalls = 0;
  const sections = Array.from({ length: 10 }, (_, index) => [
    {
      sectionId: `section-heading-${index + 1}`,
      documentId: DOCUMENT_ID,
      kind: 'heading' as const,
      level: 2,
      textRef: `Policy Topic ${index + 1}`,
      span: { paragraphStart: index * 2 + 1, paragraphEnd: index * 2 + 1 },
    },
    {
      sectionId: `section-body-${index + 1}`,
      documentId: DOCUMENT_ID,
      kind: 'paragraph_block' as const,
      textRef:
        `This section explains enterprise ingestion control ${index + 1}, including review routing, validation, retention, and operator actions. ` +
        'It is intentionally long enough to force section-level enrichment instead of title-only skipping.',
      span: { paragraphStart: index * 2 + 2, paragraphEnd: index * 2 + 2 },
    },
  ]).flat();

  const graph = await createIngestionGraph({
    checkpointer: false,
    storage: {
      async saveDraftArtifacts() {},
      async saveChunkEmbeddings() {},
      async publishIndexedChunks() {},
      async saveStepTrace(trace) {
        traces.push({
          nodeName: trace.nodeName,
          outputSummary: trace.outputSummary as Record<string, unknown> | undefined,
        });
      },
      async saveIngestionRunResult(result) {
        runResults.push({
          status: result.status,
          metrics: result.metrics as Record<string, unknown> | undefined,
        });
      },
      async ensureIngestionRun() {},
      async resolveReviewTasks() {},
    },
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
    decisionProvider: {
      classifyDocument: async () => ({
        docType: 'policy',
        initialChunkingHypothesis: 'section',
        priorityFeatures: ['policy_manual'],
      }),
      chooseChunkStrategy: async () => ({
        chunkingStrategy: 'section',
        confidence: 'high',
        reason: 'fallback_to_section',
        fallbackStrategy: 'section',
      }),
      enrichChunk: async (chunk) => {
        enrichCalls += 1;
        if (enrichCalls === 3 || enrichCalls === 7) {
          throw new Error('synthetic enrich failure');
        }

        return {
          title: chunk.cleanText.slice(0, 60),
          summary: chunk.cleanText,
          keywords: ['policy', 'ingestion'],
          entities: [],
          questionsAnswered: [],
          authorityGuess: 'medium',
          reviewHints: [],
        };
      },
      routeReviewTask: async (input) => ({
        taskType: input.issue.chunkId ? 'chunk_review' : 'document_review',
        reasonCodes: [input.issue.code],
        summary: input.issue.message,
        suggestedAction: 'approve',
      }),
    },
  });

  const result = await graph.invoke({
    ingestionId: '42424242-4242-4242-8242-424242424242',
    documentId: DOCUMENT_ID,
    sourceUri: '/tmp/partial-enrich.html',
    originalFilename: 'partial-enrich.html',
    mimeType: 'text/html',
    status: 'RECEIVED',
      document: {
        documentId: DOCUMENT_ID,
        sourceUri: '/tmp/partial-enrich.html',
        mimeType: 'text/html',
        sectionCount: sections.length,
    },
    sections,
  } as any);

  assert.equal(enrichCalls, 10);
  assert.equal(result.status, 'INDEXED');
  assert.equal(result.metrics?.enrichFailedChunks, 2);
  assert.equal(result.metrics?.indexedChunks, 10);
  assert.deepEqual(result.metrics?.effectiveEnrichLevelCounts, { L2: 10 });

  const aggregateTrace = traces.find((trace) => trace.nodeName === 'aggregate_enrichment');
  assert.equal(aggregateTrace?.outputSummary?.enrichFailedChunks, 2);
  assert.equal(aggregateTrace?.outputSummary?.enrichLlmChunks, 10);

  assert.equal(runResults[0]?.status, 'INDEXED');
  assert.equal(runResults[0]?.metrics?.enrichFailedChunks, 2);
  assert.equal(runResults[0]?.metrics?.indexedChunks, 10);
});

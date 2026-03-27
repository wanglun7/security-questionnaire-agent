import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { generateEmbedding } from '../../../lib/ai/embeddings';
import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { createGptStructuredDecisionProvider } from '../../../lib/ingestion/services/llm-decision-provider';
import {
  REAL_CORPUS_FIXTURES,
  resolveRealCorpusPath,
} from './helpers/real-corpus-fixtures';

const shouldRunLiveFullIngestion =
  process.env.INGESTION_FULL_LIVE_TESTS === '1' &&
  Boolean(process.env.OPENAI_API_KEY) &&
  Boolean(process.env.EMBEDDING_API_KEY) &&
  Boolean(process.env.EMBEDDING_BASE_URL);

const liveFullIngestionFixtureIds = [
  'hr-manual-docx',
  'hr-manual-html',
  'vtex-checklist-xlsx',
  'cuad-collaboration-contract-pdf',
] as const;

const liveFullIngestionFixtures = REAL_CORPUS_FIXTURES.filter((fixture) =>
  liveFullIngestionFixtureIds.includes(
    fixture.id as (typeof liveFullIngestionFixtureIds)[number]
  )
);

test(
  'live full ingestion regression persists artifacts, writes embeddings, and finalizes indexed output',
  {
    skip: !shouldRunLiveFullIngestion,
  },
  async (t) => {
    for (const fixture of liveFullIngestionFixtures) {
      await t.test(fixture.id, async () => {
        const sourceUri = resolveRealCorpusPath(fixture.sourceRelativePath);

        try {
          await fs.access(sourceUri);
        } catch {
          t.skip(`missing real corpus fixture: ${sourceUri}`);
          return;
        }

        const draftArtifactCalls: Array<{
          status: string;
          chunkCount: number;
          reviewTaskCount: number;
        }> = [];
        const embeddingWrites: number[] = [];
        const publishCalls: Array<{
          chunkCount: number;
          indexedChunkCount: number;
        }> = [];
        const runResults: Array<{
          status: string;
          metrics?: Record<string, unknown>;
        }> = [];

        const graph = await createIngestionGraph({
          checkpointer: false,
          decisionProvider: createGptStructuredDecisionProvider(),
          storage: {
            async saveDraftArtifacts(input) {
              draftArtifactCalls.push({
                status: input.status,
                chunkCount: input.chunks.length,
                reviewTaskCount: input.reviewTasks.length,
              });
            },
            async saveChunkEmbeddings(embeddings) {
              embeddingWrites.push(embeddings.length);
            },
            async publishIndexedChunks(input) {
              publishCalls.push({
                chunkCount: input.chunks.length,
                indexedChunkCount: input.chunks.filter(
                  (chunk) => chunk.indexStatus === 'indexed'
                ).length,
              });
            },
            async saveStepTrace() {},
            async resolveReviewTasks() {},
            async saveIngestionRunResult(record) {
              runResults.push({
                status: record.status,
                metrics: record.metrics,
              });
            },
            async ensureIngestionRun() {},
          },
          generateEmbeddingFn: generateEmbedding,
        });

        const result = await graph.invoke({
          ingestionId: `${fixture.id}-live-full-ingestion`,
          documentId: `${fixture.id}-live-full-document`,
          executionMode: 'full_ingestion',
          sourceUri,
          originalFilename: fixture.originalFilename,
          mimeType: fixture.mimeType,
          status: 'RECEIVED',
        } as any);

        assert.equal(result.parserStrategy, fixture.expectedParserStrategy);
        assert.equal(result.docType, fixture.expectedDocType);
        assert.equal(result.chunkingStrategy, fixture.expectedChunkingStrategy);
        assert.equal(result.status, 'INDEXED');
        assert.ok((result.chunks?.length ?? 0) > 0);
        assert.ok(draftArtifactCalls.length > 0);
        assert.ok(draftArtifactCalls.some((call) => call.chunkCount > 0));
        assert.ok(embeddingWrites.some((count) => count > 0));
        assert.ok(publishCalls.some((call) => call.indexedChunkCount > 0));
        assert.equal(runResults.at(-1)?.status, 'INDEXED');
        assert.ok((runResults.at(-1)?.metrics?.indexedChunks as number | undefined) ?? 0 > 0);
      });
    }
  }
);

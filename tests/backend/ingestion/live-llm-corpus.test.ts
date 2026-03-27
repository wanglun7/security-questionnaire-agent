import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { createGptStructuredDecisionProvider } from '../../../lib/ingestion/services/llm-decision-provider';
import { REAL_CORPUS_FIXTURES, resolveRealCorpusPath } from './helpers/real-corpus-fixtures';

const shouldRunLiveCorpus =
  process.env.INGESTION_LIVE_LLM_TESTS === '1' && Boolean(process.env.OPENAI_API_KEY);

const noopStorage = {
  async saveDraftArtifacts() {},
  async saveChunkEmbeddings() {},
  async publishIndexedChunks() {},
  async saveStepTrace() {},
  async resolveReviewTasks() {},
  async saveIngestionRunResult() {},
  async ensureIngestionRun() {},
};

test('live LLM corpus regression stays aligned on parser, docType, and chunking', {
  skip: !shouldRunLiveCorpus,
}, async (t) => {
  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createGptStructuredDecisionProvider(),
    storage: noopStorage,
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });

  for (const fixture of REAL_CORPUS_FIXTURES) {
    await t.test(fixture.id, async () => {
      const sourceUri = resolveRealCorpusPath(fixture.sourceRelativePath);

      try {
        await fs.access(sourceUri);
      } catch {
        t.skip(`missing real corpus fixture: ${sourceUri}`);
        return;
      }

      const result = await graph.invoke({
        ingestionId: `${fixture.id}-live-ingestion`,
        documentId: `${fixture.id}-live-document`,
        executionMode: 'strategy_check',
        sourceUri,
        originalFilename: fixture.originalFilename,
        mimeType: fixture.mimeType,
        status: 'RECEIVED',
      } as any);

      assert.equal(result.parserStrategy, fixture.expectedParserStrategy);
      assert.equal(result.docType, fixture.expectedDocType);
      assert.equal(result.chunkingStrategy, fixture.expectedChunkingStrategy);
      assert.ok((result.chunks?.length ?? 0) > 0);
    });
  }
});

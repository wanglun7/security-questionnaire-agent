import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import { REAL_CORPUS_FIXTURES, resolveRealCorpusPath } from './helpers/real-corpus-fixtures';
import { createTestDecisionProvider } from './helpers/test-decision-provider';

const noopStorage = {
  async saveDraftArtifacts() {},
  async saveChunkEmbeddings() {},
  async publishIndexedChunks() {},
  async saveStepTrace() {},
  async resolveReviewTasks() {},
  async saveIngestionRunResult() {},
  async ensureIngestionRun() {},
};

test('real corpus strategy-check regression stays aligned on parser, docType, and chunking', async (t) => {
  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
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
        ingestionId: `${fixture.id}-ingestion`,
        documentId: `${fixture.id}-document`,
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
      assert.ok((result.chunks?.[0]?.cleanText?.trim().length ?? 0) > 0);
    });
  }
});

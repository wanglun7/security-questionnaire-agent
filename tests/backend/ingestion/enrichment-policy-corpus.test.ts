import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import { planChunkEnrichment } from '../../../lib/ingestion/services/enrichment-policy';
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

function selectRepresentativeChunk(
  chunks: ChunkContract[],
  fixture: (typeof REAL_CORPUS_FIXTURES)[number]
) {
  const sameStrategyChunks = chunks.filter(
    (chunk) => chunk.chunkStrategy === fixture.expectedChunkingStrategy
  );
  const rankedChunks = sameStrategyChunks.sort(
    (left, right) => right.cleanText.trim().length - left.cleanText.trim().length
  );

  if (fixture.expectedShouldCallLlm) {
    return rankedChunks.find((chunk) => chunk.cleanText.trim().length >= 80) ?? rankedChunks[0];
  }

  return rankedChunks[0];
}

test('deterministic enrichment policy corpus regression stays aligned on level and prompt variant', async (t) => {
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
        t.skip(`missing corpus fixture: ${sourceUri}`);
        return;
      }

      const result = await graph.invoke({
        ingestionId: `${fixture.id}-enrich-policy-ingestion`,
        documentId: `${fixture.id}-enrich-policy-document`,
        executionMode: 'strategy_check',
        sourceUri,
        originalFilename: fixture.originalFilename,
        mimeType: fixture.mimeType,
        status: 'RECEIVED',
      } as any);

      const representativeChunk = result.chunks
        ? selectRepresentativeChunk(result.chunks, fixture)
        : undefined;
      assert.ok(representativeChunk);

      const plan = planChunkEnrichment({
        executionMode: 'full_ingestion',
        runDefaultEnrichLevel: 'L2',
        chunk: representativeChunk!,
      });

      assert.equal(plan.enrichLevel, fixture.expectedEnrichLevel);
      assert.equal(plan.promptVariant, fixture.expectedPromptVariant);
      assert.equal(plan.shouldCallLlm, fixture.expectedShouldCallLlm);
      assert.ok(plan.policyReasons.length > 0);
      assert.ok(Array.isArray(plan.expectedNonEmptyFields));
    });
  }
});

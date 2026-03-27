import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { createIngestionGraph } from '../../../lib/ingestion/graph/builder';
import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import { enrichChunk } from '../../../lib/ingestion/services/enrichment';
import { planChunkEnrichment } from '../../../lib/ingestion/services/enrichment-policy';
import { createGptStructuredDecisionProvider } from '../../../lib/ingestion/services/llm-decision-provider';
import { REAL_CORPUS_FIXTURES, resolveRealCorpusPath } from './helpers/real-corpus-fixtures';
import { createTestDecisionProvider } from './helpers/test-decision-provider';

const shouldRunLiveEnrichment =
  process.env.INGESTION_ENRICH_LIVE_TESTS === '1' && Boolean(process.env.OPENAI_API_KEY);

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

const fixturesForLiveEnrichment = REAL_CORPUS_FIXTURES.filter((fixture) =>
  ['faq-html-sample', 'hr-manual-html', 'cuad-collaboration-contract-pdf', 'vtex-checklist-xlsx'].includes(
    fixture.id
  )
);

test('live provider enrichment regression keeps structured output valid', {
  skip: !shouldRunLiveEnrichment,
}, async (t) => {
  const graph = await createIngestionGraph({
    checkpointer: false,
    decisionProvider: createTestDecisionProvider(),
    storage: noopStorage,
    generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
  });
  const liveProvider = createGptStructuredDecisionProvider();

  for (const fixture of fixturesForLiveEnrichment) {
    await t.test(fixture.id, async () => {
      const sourceUri = resolveRealCorpusPath(fixture.sourceRelativePath);

      try {
        await fs.access(sourceUri);
      } catch {
        t.skip(`missing corpus fixture: ${sourceUri}`);
        return;
      }

      const result = await graph.invoke({
        ingestionId: `${fixture.id}-live-enrich-ingestion`,
        documentId: `${fixture.id}-live-enrich-document`,
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

      if (!plan.shouldCallLlm) {
        assert.equal(plan.enrichLevel, 'L0');
        assert.equal(plan.promptVariant, 'row_rule');
        return;
      }

      const enriched = await enrichChunk(representativeChunk!, {
        provider: {
          enrichChunk: liveProvider.enrichChunk!,
        },
      });

      assert.ok((enriched.title?.trim().length ?? 0) > 0);
      assert.ok((enriched.summary?.trim().length ?? 0) > 0);
      assert.equal(Array.isArray(enriched.keywords), true);
      if (fixture.expectedChunkingStrategy === 'faq') {
        assert.equal((enriched.questionsAnswered?.length ?? 0) > 0, true);
      }
    });
  }
});

import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';

import { closeDbConnection } from '../lib/db/client';
import { createIngestionGraph } from '../lib/ingestion/graph/builder';
import { createGptStructuredDecisionProvider } from '../lib/ingestion/services/llm-decision-provider';
import type { IngestionStorage } from '../lib/ingestion/storage/types';

const isolatedSmokeStorage: IngestionStorage = {
  async saveIngestionArtifacts() {},
  async saveChunkEmbeddings() {},
  async saveStepTrace() {},
  async resolveReviewTasks() {},
  async saveIngestionRunResult() {},
  async ensureIngestionRun() {},
};

const isolatedSmokeDecisionProvider = {
  async classifyDocument() {
    return {
      docType: 'questionnaire' as const,
      parserStrategy: 'xlsx' as const,
      initialChunkingHypothesis: 'row' as const,
      priorityFeatures: ['table'],
    };
  },
  async chooseChunkStrategy() {
    return {
      chunkingStrategy: 'row' as const,
      confidence: 'high' as const,
      reason: 'row_block_dominant' as const,
      fallbackStrategy: 'row' as const,
    };
  },
  async enrichChunk(chunk: { cleanText: string }) {
    return {
      title: 'Smoke row',
      summary: chunk.cleanText,
      keywords: ['smoke', 'row'],
      entities: [],
      questionsAnswered: [],
      authorityLevel: 'medium' as const,
      reviewHints: [],
    };
  },
  async routeReviewTask(input: { issue: { code: string; message: string } }) {
    return {
      taskType: 'document_review' as const,
      reasonCodes: [input.issue.code],
      summary: input.issue.message,
      suggestedAction: 'approve' as const,
    };
  },
};

function hasRealIngestionEnv() {
  return Boolean(
    process.env.DATABASE_URL &&
      process.env.EMBEDDING_BASE_URL &&
      process.env.EMBEDDING_API_KEY
  );
}

export async function runIngestionSmoke(options?: {
  useRealEnv?: boolean;
  graphFactory?: () => Promise<{ invoke: (input: Record<string, unknown>) => Promise<any> }>;
  closeResources?: () => Promise<void>;
}) {
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
    const useRealEnv = options?.useRealEnv ?? hasRealIngestionEnv();
    const graph =
      (await options?.graphFactory?.()) ??
      (await createIngestionGraph(
        useRealEnv
          ? {
              checkpointer: false,
              decisionProvider: createGptStructuredDecisionProvider(),
            }
          : {
              checkpointer: false,
              decisionProvider: isolatedSmokeDecisionProvider,
              storage: isolatedSmokeStorage,
              generateEmbeddingFn: async () => [0.1, 0.2, 0.3],
            }
      ));
    const result = await graph.invoke({
      ingestionId: randomUUID(),
      documentId: randomUUID(),
      sourceUri: tmpFile,
      originalFilename: 'smoke.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      status: 'RECEIVED',
    });

    console.log(JSON.stringify({
      status: result.status,
      chunkCount: result.chunks?.length ?? 0,
      mode: useRealEnv ? 'real' : 'isolated',
    }));

    return result;
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
    await options?.closeResources?.();
    if ((options?.useRealEnv ?? hasRealIngestionEnv()) && !options?.closeResources) {
      await closeDbConnection().catch(() => undefined);
    }
  }
}

if (require.main === module) {
  runIngestionSmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

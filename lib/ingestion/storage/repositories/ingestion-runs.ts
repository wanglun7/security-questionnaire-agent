import { eq } from 'drizzle-orm';

import { db } from '../../../db/client';
import { ingestionRuns } from '../../../db/schema';

export async function upsertIngestionRun(input: {
  ingestionId: string;
  documentId: string;
  status: string;
  parserStrategy?: string;
  chunkingStrategy?: string;
  metrics?: Record<string, unknown>;
  error?: Record<string, unknown>;
  finishedAt?: Date;
}) {
  await db
    .insert(ingestionRuns)
    .values({
      id: input.ingestionId,
      documentId: input.documentId,
      status: input.status,
      parserStrategy: input.parserStrategy,
      chunkingStrategy: input.chunkingStrategy,
      metricsJson: input.metrics,
      errorJson: input.error,
      finishedAt: input.finishedAt,
    })
    .onConflictDoUpdate({
      target: ingestionRuns.id,
      set: {
        status: input.status,
        parserStrategy: input.parserStrategy,
        chunkingStrategy: input.chunkingStrategy,
        metricsJson: input.metrics,
        errorJson: input.error,
        finishedAt: input.finishedAt,
      },
    });
}

export async function updateIngestionRunResult(input: {
  ingestionId: string;
  status: string;
  metrics?: Record<string, unknown>;
  error?: Record<string, unknown>;
  finishedAt?: Date;
}) {
  await db
    .update(ingestionRuns)
    .set({
      status: input.status,
      metricsJson: input.metrics,
      errorJson: input.error,
      finishedAt: input.finishedAt,
    })
    .where(eq(ingestionRuns.id, input.ingestionId));
}

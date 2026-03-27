import { eq } from 'drizzle-orm';

import { db } from '../../../db/client';
import { enrichmentCacheEntries } from '../../../db/schema';
import type { EnrichmentCacheEntry } from '../../contracts/enrichment';
import type { ChunkEnrichmentDecisionContract } from '../../contracts/decision';

function toEntry(
  row: typeof enrichmentCacheEntries.$inferSelect
): EnrichmentCacheEntry {
  return {
    cacheKey: row.cacheKey,
    chunkId: row.chunkId,
    tenantId: row.tenantId,
    checksum: row.checksum,
    chunkStrategy: row.chunkStrategy as EnrichmentCacheEntry['chunkStrategy'],
    enrichLevel: row.enrichLevel as EnrichmentCacheEntry['enrichLevel'],
    promptVariant: row.promptVariant as EnrichmentCacheEntry['promptVariant'],
    promptVersion: row.promptVersion,
    outputSchemaVersion: row.outputSchemaVersion,
    modelId: row.modelId,
    output: row.outputJson as ChunkEnrichmentDecisionContract,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getEnrichmentCacheEntry(cacheKey: string) {
  const row = await db.query.enrichmentCacheEntries.findFirst({
    where: eq(enrichmentCacheEntries.cacheKey, cacheKey),
  });

  return row ? toEntry(row) : null;
}

export async function upsertEnrichmentCacheEntry(entry: EnrichmentCacheEntry) {
  await db
    .insert(enrichmentCacheEntries)
    .values({
      cacheKey: entry.cacheKey,
      chunkId: entry.chunkId,
      tenantId: entry.tenantId,
      checksum: entry.checksum,
      chunkStrategy: entry.chunkStrategy,
      enrichLevel: entry.enrichLevel,
      promptVariant: entry.promptVariant,
      promptVersion: entry.promptVersion,
      outputSchemaVersion: entry.outputSchemaVersion,
      modelId: entry.modelId,
      outputJson: entry.output,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: enrichmentCacheEntries.cacheKey,
      set: {
        chunkId: entry.chunkId,
        tenantId: entry.tenantId,
        checksum: entry.checksum,
        chunkStrategy: entry.chunkStrategy,
        enrichLevel: entry.enrichLevel,
        promptVariant: entry.promptVariant,
        promptVersion: entry.promptVersion,
        outputSchemaVersion: entry.outputSchemaVersion,
        modelId: entry.modelId,
        outputJson: entry.output,
        updatedAt: new Date(),
      },
    });
}

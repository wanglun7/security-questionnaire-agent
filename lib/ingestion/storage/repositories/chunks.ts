import { eq, sql } from 'drizzle-orm';

import { db } from '../../../db/client';
import { knowledgeChunks } from '../../../db/schema';
import type { ChunkContract } from '../../contracts/chunk';

function resolveChunkIndex(chunk: ChunkContract, fallbackIndex: number) {
  if (chunk.chunkStrategy === 'row' && typeof chunk.span.rowStart === 'number') {
    return chunk.span.rowStart;
  }

  return fallbackIndex;
}

function toChunkRow(chunk: ChunkContract, chunkIndex: number) {
  return {
    id: chunk.chunkId,
    documentId: chunk.documentId,
    chunkIndex,
    content: chunk.cleanText,
    citationLabel: chunk.title ?? `chunk-${chunkIndex + 1}`,
    sectionId: chunk.sectionId,
    tenant: chunk.tenant,
    rawTextRef: chunk.rawTextRef,
    cleanText: chunk.cleanText,
    contextualText: chunk.contextualText,
    title: chunk.title,
    summary: chunk.summary,
    keywordsJson: chunk.keywords,
    entitiesJson: chunk.entities,
    questionsAnsweredJson: chunk.questionsAnswered,
    chunkStrategy: chunk.chunkStrategy,
    spanJson: chunk.span,
    indexStatus: chunk.indexStatus,
    checksum: chunk.checksum,
    effectiveDate: chunk.effectiveDate,
    version: chunk.version,
    authorityLevel: chunk.authorityLevel,
    aclTagsJson: chunk.aclTags,
    authorityGuess: chunk.authorityGuess,
    reviewStatus: chunk.reviewStatus,
    metadataVersion: chunk.metadataVersion,
  };
}

export async function replaceKnowledgeChunks(
  documentId: string,
  chunks: ChunkContract[]
) {
  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));

  if (chunks.length === 0) {
    return;
  }

  await db.insert(knowledgeChunks).values(
    chunks.map((chunk, index) => toChunkRow(chunk, resolveChunkIndex(chunk, index)))
  );
}

export async function upsertKnowledgeChunks(chunks: ChunkContract[]) {
  for (const [index, chunk] of chunks.entries()) {
    await db
      .insert(knowledgeChunks)
      .values(toChunkRow(chunk, resolveChunkIndex(chunk, index)))
      .onConflictDoUpdate({
        target: knowledgeChunks.id,
        set: {
          documentId: chunk.documentId,
          chunkIndex: resolveChunkIndex(chunk, index),
          content: chunk.cleanText,
          citationLabel: chunk.title ?? `chunk-${index + 1}`,
          sectionId: chunk.sectionId,
          tenant: chunk.tenant,
          rawTextRef: chunk.rawTextRef,
          cleanText: chunk.cleanText,
          contextualText: chunk.contextualText,
          title: chunk.title,
          summary: chunk.summary,
          keywordsJson: chunk.keywords,
          entitiesJson: chunk.entities,
          questionsAnsweredJson: chunk.questionsAnswered,
          chunkStrategy: chunk.chunkStrategy,
          spanJson: chunk.span,
          indexStatus: chunk.indexStatus,
          checksum: chunk.checksum,
          effectiveDate: chunk.effectiveDate,
          version: chunk.version,
          authorityLevel: chunk.authorityLevel,
          aclTagsJson: chunk.aclTags,
          authorityGuess: chunk.authorityGuess,
          reviewStatus: chunk.reviewStatus,
          metadataVersion: chunk.metadataVersion,
          updatedAt: new Date(),
        },
      });
  }
}

export async function saveChunkEmbeddings(
  embeddings: Array<{ chunkId: string; embedding: number[] }>
) {
  for (const item of embeddings) {
    await db.execute(sql`
      UPDATE ${knowledgeChunks}
      SET embedding = ${JSON.stringify(item.embedding)}::vector
      WHERE id = ${item.chunkId}::uuid
    `);
  }
}

export async function publishKnowledgeChunks(chunks: ChunkContract[]) {
  for (const chunk of chunks) {
    await db
      .update(knowledgeChunks)
      .set({
        tenant: chunk.tenant,
        rawTextRef: chunk.rawTextRef,
        cleanText: chunk.cleanText,
        contextualText: chunk.contextualText,
        title: chunk.title,
        summary: chunk.summary,
        keywordsJson: chunk.keywords,
        entitiesJson: chunk.entities,
        questionsAnsweredJson: chunk.questionsAnswered,
        spanJson: chunk.span,
        reviewStatus: chunk.reviewStatus,
        indexStatus: chunk.indexStatus,
        checksum: chunk.checksum,
        effectiveDate: chunk.effectiveDate,
        version: chunk.version,
        authorityLevel: chunk.authorityLevel,
        aclTagsJson: chunk.aclTags,
        metadataVersion: chunk.metadataVersion,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeChunks.id, chunk.chunkId));
  }
}

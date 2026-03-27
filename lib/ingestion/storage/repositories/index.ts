import {
  publishKnowledgeChunks,
  replaceKnowledgeChunks,
  saveChunkEmbeddings as saveEmbeddings,
  upsertKnowledgeChunks,
} from './chunks';
import { upsertDocument } from './documents';
import { updateIngestionRunResult, upsertIngestionRun } from './ingestion-runs';
import {
  replaceReviewTasks,
  resolveReviewTasks as resolveTasks,
  upsertReviewTasks,
} from './review-tasks';
import { replaceSections, upsertSections } from './sections';
import { insertStepTrace } from './step-traces';
import type { IngestionStorage } from '../types';

export const ingestionStorage: IngestionStorage = {
  async saveIngestionArtifacts(input) {
    await upsertDocument(input.document);
    if (input.writeMode === 'append') {
      await upsertSections(input.sections);
      await upsertKnowledgeChunks(input.chunks);
    } else {
      await replaceSections(input.document.documentId, input.sections);
      await replaceKnowledgeChunks(input.document.documentId, input.chunks);
    }
    await upsertIngestionRun({
      ingestionId: input.ingestionId,
      documentId: input.document.documentId,
      status: input.status,
      parserStrategy: input.parserStrategy,
      chunkingStrategy: input.chunkingStrategy,
    });
    if (input.writeMode === 'append') {
      await upsertReviewTasks(input.ingestionId, input.document.documentId, input.reviewTasks);
    } else {
      await replaceReviewTasks(input.ingestionId, input.document.documentId, input.reviewTasks);
    }
  },
  async saveDraftArtifacts(input) {
    await upsertDocument(input.document);
    if (input.writeMode === 'append') {
      await upsertSections(input.sections);
      await upsertKnowledgeChunks(input.chunks);
    } else {
      await replaceSections(input.document.documentId, input.sections);
      await replaceKnowledgeChunks(input.document.documentId, input.chunks);
    }
    await upsertIngestionRun({
      ingestionId: input.ingestionId,
      documentId: input.document.documentId,
      status: input.status,
      parserStrategy: input.parserStrategy,
      chunkingStrategy: input.chunkingStrategy,
      metrics: undefined,
      error: undefined,
    });
    if (input.writeMode === 'append') {
      await upsertReviewTasks(input.ingestionId, input.document.documentId, input.reviewTasks);
    } else {
      await replaceReviewTasks(input.ingestionId, input.document.documentId, input.reviewTasks);
    }
  },
  async publishIndexedChunks(input) {
    await publishKnowledgeChunks(input.chunks);
  },
  async saveChunkEmbeddings(embeddings) {
    await saveEmbeddings(embeddings);
  },
  async saveStepTrace(trace) {
    await insertStepTrace(trace);
  },
  async resolveReviewTasks(records) {
    await resolveTasks(records);
  },
  async saveIngestionRunResult(record) {
    await updateIngestionRunResult({
      ingestionId: record.ingestionId,
      status: record.status,
      metrics: record.metrics,
      error: record.error,
      finishedAt: new Date(),
    });
  },
  async ensureIngestionRun(record) {
    await upsertDocument({
      documentId: record.documentId,
      sourceUri: record.sourceUri,
      mimeType: record.mimeType,
      docType: record.docType,
    });
    await upsertIngestionRun(record);
  },
};

import type { ChunkContract } from '../contracts/chunk';
import type { DocumentContract } from '../contracts/document';
import type { EnrichmentCacheEntry } from '../contracts/enrichment';
import type { ReviewTaskContract } from '../contracts/review';
import type { SectionContract } from '../contracts/section';
import type { StepTraceContract } from '../contracts/trace';

export type IngestionArtifacts = {
  ingestionId: string;
  document: DocumentContract;
  sections: SectionContract[];
  chunks: ChunkContract[];
  reviewTasks: ReviewTaskContract[];
  parserStrategy?: string;
  chunkingStrategy?: string;
  status: string;
  persistenceStage?: 'draft' | 'final';
  writeMode?: 'replace' | 'append';
};

export type ChunkEmbeddingRecord = {
  chunkId: string;
  embedding: number[];
};

export type ReviewTaskResolutionRecord = {
  reviewTaskId: string;
  status: 'resolved';
  resolutionType?: string;
  resolutionJson: Record<string, unknown>;
  resolvedAt?: string;
};

export type IngestionRunResultRecord = {
  ingestionId: string;
  status: string;
  metrics?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

export type EnsureIngestionRunRecord = {
  ingestionId: string;
  documentId: string;
  status: string;
  sourceUri: string;
  mimeType: string;
  docType?: string;
  parserStrategy?: string;
  chunkingStrategy?: string;
};

export type IngestionStorage = {
  saveIngestionArtifacts?(input: IngestionArtifacts): Promise<void>;
  saveDraftArtifacts?(input: IngestionArtifacts): Promise<void>;
  publishIndexedChunks?(input: {
    documentId: string;
    chunks: ChunkContract[];
  }): Promise<void>;
  saveChunkEmbeddings(embeddings: ChunkEmbeddingRecord[]): Promise<void>;
  saveStepTrace?(trace: StepTraceContract): Promise<void>;
  resolveReviewTasks?(records: ReviewTaskResolutionRecord[]): Promise<void>;
  saveIngestionRunResult?(record: IngestionRunResultRecord): Promise<void>;
  ensureIngestionRun?(record: EnsureIngestionRunRecord): Promise<void>;
  getEnrichmentCacheEntry?(cacheKey: string): Promise<EnrichmentCacheEntry | null>;
  saveEnrichmentCacheEntry?(entry: EnrichmentCacheEntry): Promise<void>;
};

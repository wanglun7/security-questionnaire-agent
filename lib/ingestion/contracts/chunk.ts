import type { SourceSpanContract } from './section';

export type ChunkStrategy = 'section' | 'faq' | 'clause' | 'row';
export type ChunkReviewStatus = 'pending' | 'approved' | 'review_required' | 'rejected';
export type ChunkIndexStatus =
  | 'pending'
  | 'indexed'
  | 'rejected'
  | 'stale'
  | 'reindex_required';
export type ChunkAuthorityLevel = 'low' | 'medium' | 'high';

export type ChunkTaskContract = {
  taskId: string;
  documentId: string;
  sectionId?: string;
  chunkingStrategy: ChunkStrategy;
  textRef: string;
  span: SourceSpanContract;
};

export type ChunkContract = {
  chunkId: string;
  documentId: string;
  sectionId?: string;
  tenant: string;
  rawTextRef: string;
  cleanText: string;
  contextualText?: string;
  title?: string;
  summary?: string;
  keywords?: string[];
  entities?: string[];
  questionsAnswered?: string[];
  version?: string;
  effectiveDate?: string;
  authorityLevel?: ChunkAuthorityLevel;
  aclTags: string[];
  checksum: string;
  versionGuess?: string;
  authorityGuess?: ChunkAuthorityLevel;
  reviewStatus: ChunkReviewStatus;
  indexStatus: ChunkIndexStatus;
  chunkStrategy: ChunkStrategy;
  span: SourceSpanContract;
  metadataVersion: number;
  reviewHints?: string[];
  embedding?: number[];
};

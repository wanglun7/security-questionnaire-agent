import type { SourceSpanContract } from './section';

export type ChunkTaskContract = {
  taskId: string;
  documentId: string;
  sectionId?: string;
  chunkingStrategy: 'section' | 'faq' | 'clause' | 'row';
  textRef: string;
  span: SourceSpanContract;
};

export type ChunkContract = {
  chunkId: string;
  documentId: string;
  sectionId?: string;
  rawTextRef: string;
  cleanText: string;
  contextualText?: string;
  title?: string;
  summary?: string;
  keywords?: string[];
  entities?: string[];
  questionsAnswered?: string[];
  versionGuess?: string;
  authorityGuess?: 'low' | 'medium' | 'high';
  reviewStatus: 'pending' | 'approved' | 'review_required';
  chunkStrategy: 'section' | 'faq' | 'clause' | 'row';
  span: SourceSpanContract;
  metadataVersion: number;
};

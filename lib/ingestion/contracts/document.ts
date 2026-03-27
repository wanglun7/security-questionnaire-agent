import type { ChunkStrategyConfidence } from './decision';

export type DocumentContract = {
  documentId: string;
  sourceUri: string;
  mimeType: string;
  docType?: string;
  title?: string;
  language?: string;
  checksum?: string;
  pageCount?: number;
  sectionCount?: number;
  chunkStrategyConfidence?: ChunkStrategyConfidence;
  createdAt?: string;
};

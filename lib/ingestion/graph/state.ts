import type { ChunkContract, ChunkTaskContract } from '../contracts/chunk';
import type { DocumentContract } from '../contracts/document';
import type { ReviewTaskContract, ValidationIssueContract } from '../contracts/review';
import type { SectionContract } from '../contracts/section';
import type { StepTraceContract } from '../contracts/trace';

export type IngestionStatus =
  | 'RECEIVED'
  | 'CLASSIFIED'
  | 'PARSED'
  | 'CHUNKED'
  | 'ENRICHED'
  | 'VALIDATED'
  | 'REVIEW_REQUIRED'
  | 'INDEXED'
  | 'PARSE_FAILED'
  | 'ENRICH_FAILED'
  | 'REJECTED'
  | 'FAILED';

export type IngestionState = {
  ingestionId: string;
  documentId: string;
  tenantId?: string;
  sourceUri: string;
  originalFilename: string;
  mimeType: string;
  uploadedBy?: string;
  sourceTags?: string[];
  status: IngestionStatus;
  docType?: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  parserStrategy?: 'pdf' | 'docx' | 'xlsx' | 'html';
  chunkingStrategy?: 'section' | 'faq' | 'clause' | 'row';
  priorityFeatures?: string[];
  document?: DocumentContract;
  sections?: SectionContract[];
  chunkTasks?: ChunkTaskContract[];
  chunks?: ChunkContract[];
  validationIssues?: ValidationIssueContract[];
  reviewTasks?: ReviewTaskContract[];
  metrics?: {
    parseMs?: number;
    chunkMs?: number;
    enrichmentMs?: number;
    validationMs?: number;
    totalChunks?: number;
  };
  trace?: StepTraceContract[];
  error?: {
    code: string;
    message: string;
    node?: string;
  };
};

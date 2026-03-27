import type { ChunkContract, ChunkTaskContract } from '../contracts/chunk';
import type { ChunkStrategyConfidence } from '../contracts/decision';
import type { DocumentContract } from '../contracts/document';
import type { ChunkEnrichmentRuntime } from '../contracts/enrichment';
import type { ReviewTaskContract, ValidationIssueContract } from '../contracts/review';
import type { SectionContract } from '../contracts/section';
import type { StepTraceContract } from '../contracts/trace';
import type {
  XlsxRowBatchDescriptor,
  XlsxRowBatchPlan,
} from '../services/parsers/xlsx';

export type IngestionStatus =
  | 'RECEIVED'
  | 'CLASSIFIED'
  | 'PARSED'
  | 'CHUNKED'
  | 'ENRICHED'
  | 'VALIDATED'
  | 'REVIEW_REQUIRED'
  | 'INDEXING'
  | 'INDEXED'
  | 'PARTIALLY_INDEXED'
  | 'PARSE_FAILED'
  | 'ENRICH_FAILED'
  | 'REJECTED'
  | 'FAILED';

export type IngestionState = {
  ingestionId: string;
  documentId: string;
  executionMode?: 'full_ingestion' | 'strategy_check';
  tenantId?: string;
  sourceUri: string;
  originalFilename: string;
  mimeType: string;
  previewText?: string;
  uploadedBy?: string;
  sourceTags?: string[];
  status: IngestionStatus;
  docType?: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  parserStrategy?: 'pdf' | 'docx' | 'xlsx' | 'html';
  initialChunkingHypothesis?: 'section' | 'faq' | 'clause' | 'row';
  chunkingStrategy?: 'section' | 'faq' | 'clause' | 'row';
  chunkStrategyConfidence?: ChunkStrategyConfidence;
  chunkStrategyReason?: string;
  fallbackChunkingStrategy?: 'section' | 'faq' | 'clause' | 'row';
  priorityFeatures?: string[];
  document?: DocumentContract;
  sections?: SectionContract[];
  rowBatchPlan?: XlsxRowBatchPlan;
  rowBatchProgress?: {
    currentBatchIndex: number;
    totalBatches: number;
    sectionsPersisted?: boolean;
    processedChunks: number;
    approvedChunks: number;
    rejectedChunks: number;
    indexedChunks: number;
  };
  currentRowBatch?: (XlsxRowBatchDescriptor & { isLastBatch: boolean }) | undefined;
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
    approvedChunks?: number;
    rejectedChunks?: number;
    indexedChunks?: number;
  } & ChunkEnrichmentRuntime;
  trace?: StepTraceContract[];
  error?: {
    code: string;
    message: string;
    node?: string;
  };
};

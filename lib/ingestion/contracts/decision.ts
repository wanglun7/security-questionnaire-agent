import type { ChunkAuthorityLevel, ChunkStrategy } from './chunk';
import type { ReviewTaskType } from './review';
import type { SectionContract } from './section';
import type { ParserStrategy } from '../services/parser-router';

export type ChunkStrategyConfidence = 'low' | 'medium' | 'high';

export type ChunkStrategyDecisionInput = {
  parserStrategy: ParserStrategy;
  docType?: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  initialChunkingHypothesis?: ChunkStrategy;
  priorityFeatures?: string[];
  previewText?: string;
  sectionCount?: number;
  sampledSectionCount?: number;
  sections: Array<Pick<SectionContract, 'kind' | 'textRef'>>;
};

export type ChunkStrategyDecisionContract = {
  chunkingStrategy: ChunkStrategy;
  confidence: ChunkStrategyConfidence;
  reason:
    | 'row_block_dominant'
    | 'faq_block_dominant'
    | 'clause_block_dominant'
    | 'doc_type_faq'
    | 'doc_type_contract'
    | 'fallback_to_section'
    | 'manual_override';
  fallbackStrategy: ChunkStrategy;
};

export type DocumentClassificationDecisionContract = {
  docType: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  initialChunkingHypothesis: ChunkStrategy;
  priorityFeatures: string[];
};

export type ChunkEnrichmentDecisionContract = {
  title?: string;
  summary?: string;
  keywords?: string[];
  entities?: string[];
  questionsAnswered?: string[];
  versionGuess?: string;
  authorityGuess?: ChunkAuthorityLevel;
  reviewHints?: string[];
};

export type ReviewRoutingDecisionContract = {
  taskType: ReviewTaskType;
  reasonCodes: string[];
  summary: string;
  suggestedAction: 'approve' | 'edit' | 'reject';
  assignee?: string;
  owner?: string;
};

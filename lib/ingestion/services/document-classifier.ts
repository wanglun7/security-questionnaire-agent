import type { ChunkStrategy } from '../contracts/chunk';
import type { ParserStrategy } from './parser-router';
import type { IngestionDecisionProvider } from './llm-decision-provider';
import type { SectionContract } from '../contracts/section';

export type DocumentClassificationInput = {
  parserStrategy: ParserStrategy;
  mimeType: string;
  originalFilename: string;
  previewText?: string;
  sectionCount?: number;
  sampledSectionCount?: number;
  sections: Array<Pick<SectionContract, 'kind' | 'textRef'>>;
};

export type DocumentClassificationResult = {
  docType: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  initialChunkingHypothesis: ChunkStrategy;
  priorityFeatures: string[];
};

export async function classifyDocument(
  input: DocumentClassificationInput,
  options?: {
    provider?: Pick<IngestionDecisionProvider, 'classifyDocument'>;
  }
): Promise<DocumentClassificationResult> {
  if (!options?.provider?.classifyDocument) {
    throw new Error('LLM decision provider is required for document classification');
  }

  const decision = await options.provider.classifyDocument(input);
  if (!decision) {
    throw new Error('LLM document classification returned no decision');
  }

  return decision;
}

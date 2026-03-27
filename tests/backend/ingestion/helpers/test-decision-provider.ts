import type { ChunkContract } from '../../../../lib/ingestion/contracts/chunk';
import type {
  ChunkStrategyDecisionInput,
  ReviewRoutingDecisionContract,
} from '../../../../lib/ingestion/contracts/decision';
import type { SectionContract } from '../../../../lib/ingestion/contracts/section';
import type { IngestionDecisionProvider } from '../../../../lib/ingestion/services/llm-decision-provider';
import { buildDocumentClassificationFeatures } from '../../../../lib/ingestion/services/llm-decision-provider';
import type { ReviewTaskRoutingInput } from '../../../../lib/ingestion/services/review-routing';

function classifyFromPreview(input: {
  parserStrategy: 'pdf' | 'docx' | 'xlsx' | 'html';
  mimeType: string;
  originalFilename: string;
  previewText?: string;
  sections: Array<Pick<SectionContract, 'kind' | 'textRef'>>;
}) {
  const preview = (input.previewText ?? '').toLowerCase();
  const features = buildDocumentClassificationFeatures({
    ...input,
    sectionCount: input.sections.length,
    sampledSectionCount: input.sections.length,
  });
  const rowDensity = Number(features.densitySignals.rowTableDensity);
  const faqDensity = Number(features.densitySignals.faqPairDensity);
  const clauseDensity = Number(features.densitySignals.clausePatternDensity);
  const lexical = features.lexicalSignalCounts;

  if (input.parserStrategy === 'xlsx') {
    if (lexical.contract >= Math.max(lexical.questionnaire, lexical.product_doc) && lexical.contract > 0) {
      return {
        docType: 'contract' as const,
        initialChunkingHypothesis: 'row' as const,
        priorityFeatures: ['rows', 'legal_clauses'],
      };
    }

    if (lexical.questionnaire > lexical.product_doc) {
      return {
        docType: 'questionnaire' as const,
        initialChunkingHypothesis: 'row' as const,
        priorityFeatures: ['checklist', 'rows'],
      };
    }

    return {
      docType: 'product_doc' as const,
      initialChunkingHypothesis: 'row' as const,
      priorityFeatures: ['taxonomy', 'rows'],
    };
  }

  if (
    faqDensity >= 0.25 ||
    /\bfaq\b/.test(preview) ||
    ((preview.match(/\?/g) ?? []).length >= 2 &&
      /\b(what|how|why|when|where|who|which|can|does|is|are)\b/.test(preview))
  ) {
    return {
      docType: 'faq' as const,
      initialChunkingHypothesis: 'faq' as const,
      priorityFeatures: ['faq'],
    };
  }

  if (
    clauseDensity >= 0.2 ||
    /\b(agreement|confidential information|whereas|now, therefore|effective date)\b/.test(preview)
  ) {
    return {
      docType: 'contract' as const,
      initialChunkingHypothesis: 'clause' as const,
      priorityFeatures: ['clauses'],
    };
  }

  if (lexical.policy >= lexical.product_doc && lexical.policy > 0) {
    return {
      docType: 'policy' as const,
      initialChunkingHypothesis: 'section' as const,
      priorityFeatures: ['headings'],
    };
  }

  if (lexical.product_doc > 0) {
    return {
      docType: 'product_doc' as const,
      initialChunkingHypothesis: 'section' as const,
      priorityFeatures: ['reference'],
    };
  }

  return {
    docType: 'policy' as const,
    initialChunkingHypothesis: 'section' as const,
    priorityFeatures: ['pages'],
  };
}

function chooseStrategy(input: ChunkStrategyDecisionInput) {
  const total = Math.max(input.sections.length, 1);
  const count = (kind: string) => input.sections.filter((section) => section.kind === kind).length;
  const rowDensity = (count('row_block') + count('table')) / total;
  const faqDensity = count('faq_block') / total;
  const clauseDensity = count('clause_block') / total;
  const preview = (input.previewText ?? '').toLowerCase();
  const fallbackStrategy = input.initialChunkingHypothesis ?? 'section';

  if (rowDensity >= 0.45) {
    return {
      chunkingStrategy: 'row' as const,
      confidence: 'high' as const,
      reason: 'row_block_dominant' as const,
      fallbackStrategy,
    };
  }

  if (faqDensity >= 0.25 || ((preview.match(/\?/g) ?? []).length >= 2 && /\b(answer|stands for|yes|no)\b/.test(preview))) {
    return {
      chunkingStrategy: 'faq' as const,
      confidence: 'high' as const,
      reason: 'faq_block_dominant' as const,
      fallbackStrategy,
    };
  }

  if (
    clauseDensity >= 0.2 ||
    /\b(agreement|confidential information|whereas|now, therefore|effective date)\b/.test(preview)
  ) {
    return {
      chunkingStrategy: 'clause' as const,
      confidence: 'high' as const,
      reason: 'clause_block_dominant' as const,
      fallbackStrategy,
    };
  }

  if (input.docType === 'faq') {
    return {
      chunkingStrategy: 'faq' as const,
      confidence: 'medium' as const,
      reason: 'doc_type_faq' as const,
      fallbackStrategy,
    };
  }

  if (input.docType === 'contract') {
    return {
      chunkingStrategy: 'clause' as const,
      confidence: 'medium' as const,
      reason: 'doc_type_contract' as const,
      fallbackStrategy,
    };
  }

  return {
    chunkingStrategy: fallbackStrategy,
    confidence: 'low' as const,
    reason: 'fallback_to_section' as const,
    fallbackStrategy,
  };
}

function enrichChunk(chunk: ChunkContract) {
  const firstLine = chunk.cleanText.split('\n')[0]?.trim() || chunk.cleanText.slice(0, 60);
  const summary = chunk.cleanText.replace(/\s+/g, ' ').slice(0, 180);
  const keywords = summary
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter((term) => term.length >= 3)
    .slice(0, 5);

  return {
    title: firstLine.slice(0, 80) || 'Chunk Summary',
    summary,
    keywords: keywords.length > 0 ? keywords : ['knowledge'],
    entities: [],
    questionsAnswered: /[?？]/.test(firstLine) ? [firstLine] : [],
    authorityLevel: chunk.authorityLevel ?? chunk.authorityGuess ?? 'medium',
    reviewHints: [],
  };
}

function routeReviewTask(input: ReviewTaskRoutingInput): ReviewRoutingDecisionContract {
  return {
    taskType: input.issue.chunkId ? 'chunk_review' : 'document_review',
    reasonCodes: [input.issue.code],
    summary: input.issue.message,
    suggestedAction: input.issue.severity === 'high' ? 'edit' : 'approve',
    owner: input.issue.code === 'POSSIBLE_PROMPT_INJECTION' ? 'security-team' : undefined,
  };
}

export function createTestDecisionProvider(): IngestionDecisionProvider {
  return {
    classifyDocument: async (input) => classifyFromPreview(input),
    chooseChunkStrategy: async (input) => chooseStrategy(input),
    enrichChunk: async (chunk) => enrichChunk(chunk),
    routeReviewTask: async (input) => routeReviewTask(input),
  };
}

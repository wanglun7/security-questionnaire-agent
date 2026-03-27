import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import { openai } from '../../ai/client';
import type { ChunkContract } from '../contracts/chunk';
import type {
  ChunkEnrichmentDecisionContract,
  ChunkStrategyDecisionContract,
  DocumentClassificationDecisionContract,
  ReviewRoutingDecisionContract,
} from '../contracts/decision';
import type { ReviewTaskRoutingInput } from './review-routing';
import type { ChunkStrategyDecisionInput } from '../contracts/decision';
import type { DocumentClassificationInput } from './document-classifier';
import {
  countClauseLikeSections,
  countQuestionLikeSections,
  extractPreviewSnippets,
} from './section-normalization';

export type DocumentClassificationFeatureSummary = {
  sectionKindCounts: Record<string, number>;
  densitySignals: {
    headingDensity: string;
    faqPairDensity: string;
    clausePatternDensity: string;
    rowTableDensity: string;
  };
  carrierHints: {
    tabularCarrier: boolean;
    faqCarrier: boolean;
    clauseCarrier: boolean;
    headingStructured: boolean;
  };
  sampleRows: string[];
  sampleHeadings: string[];
  sampleFaqBlocks: string[];
  sampleClauseBlocks: string[];
  previewSnippets: string[];
  lexicalSignalCounts: Record<'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc', number>;
};

export type IngestionDecisionProvider = {
  classifyDocument?: (
    input: DocumentClassificationInput
  ) => Promise<DocumentClassificationDecisionContract | null>;
  chooseChunkStrategy?: (
    input: ChunkStrategyDecisionInput
  ) => Promise<ChunkStrategyDecisionContract | null>;
  enrichChunk?: (
    chunk: ChunkContract
  ) => Promise<ChunkEnrichmentDecisionContract | null>;
  routeReviewTask?: (
    input: ReviewTaskRoutingInput
  ) => Promise<ReviewRoutingDecisionContract | null>;
};

const modelName = process.env.OPENAI_COMPLETION_MODEL || 'gpt-5.2';

const documentClassificationSchema = z.object({
  docType: z.enum(['faq', 'policy', 'contract', 'questionnaire', 'product_doc']),
  initialChunkingHypothesis: z.enum(['section', 'faq', 'clause', 'row']),
  priorityFeatures: z.array(z.string()).max(5),
});

const chunkStrategySchema = z.object({
  chunkingStrategy: z.enum(['section', 'faq', 'clause', 'row']),
  confidence: z.enum(['low', 'medium', 'high']),
  reason: z.enum([
    'row_block_dominant',
    'faq_block_dominant',
    'clause_block_dominant',
    'doc_type_faq',
    'doc_type_contract',
    'fallback_to_section',
    'manual_override',
  ]),
  fallbackStrategy: z.enum(['section', 'faq', 'clause', 'row']),
});

const enrichmentSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(240),
  keywords: z.array(z.string()).max(8),
  entities: z.array(z.string()).max(8).default([]),
  questionsAnswered: z.array(z.string()).max(6).default([]),
  versionGuess: z.string().max(60).optional(),
  authorityLevel: z.enum(['low', 'medium', 'high']).optional(),
  reviewHints: z.array(z.string()).max(6).default([]),
});

const reviewRoutingSchema = z.object({
  taskType: z.enum(['document_review', 'chunk_review', 'metadata_review', 'strategy_review']),
  reasonCodes: z.array(z.string()).min(1).max(4),
  summary: z.string().min(1).max(240),
  suggestedAction: z.enum(['approve', 'edit', 'reject']),
  assignee: z.string().max(120).optional(),
  owner: z.string().max(120).optional(),
});

function getModel() {
  return openai(modelName);
}

function parseJsonCandidate(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate);
}

const DOC_TYPE_SIGNAL_PATTERNS = {
  faq: [
    /\bfaq\b/i,
    /\bquestion\b/i,
    /\banswer\b/i,
    /\bwhat\b/i,
    /\bhow\b/i,
    /\bwhy\b/i,
  ],
  policy: [
    /\bpolicy\b/i,
    /\bmanual\b/i,
    /\bhandbook\b/i,
    /\bemployee\b/i,
    /\bprocedure\b/i,
    /\bworkplace\b/i,
    /\bleave\b/i,
    /\bbenefit\b/i,
    /\bconduct\b/i,
    /\bhr\b/i,
  ],
  contract: [
    /\bagreement\b/i,
    /\bparty\b/i,
    /\bparties\b/i,
    /\bconfidential\b/i,
    /\beffective date\b/i,
    /\bwhereas\b/i,
    /\bindemn/i,
    /\baudit rights?\b/i,
    /\bobligation\b/i,
    /\blicensor\b/i,
    /\blicensee\b/i,
    /\bterm\b/i,
  ],
  questionnaire: [
    /\bquestionnaire\b/i,
    /\bchecklist\b/i,
    /\bassessment\b/i,
    /\bsurvey\b/i,
    /\bstatus\b/i,
    /\bnotes?\b/i,
    /\bcontrol\b/i,
    /\brequirement\b/i,
    /\bevidence\b/i,
    /\bcheck\b/i,
    /\byes\/no\b/i,
  ],
  product_doc: [
    /\bproduct\b/i,
    /\bmodule\b/i,
    /\bfeature\b/i,
    /\bconfiguration\b/i,
    /\bsetup\b/i,
    /\bguide\b/i,
    /\breference\b/i,
    /\btroubleshooting\b/i,
    /\bcategory\b/i,
    /\bcatalog\b/i,
    /\btaxonomy\b/i,
    /\bstorefront\b/i,
    /\bdocs?\b/i,
  ],
} satisfies Record<
  DocumentClassificationDecisionContract['docType'],
  RegExp[]
>;

function sampleSectionTexts(
  sections: Array<Pick<DocumentClassificationInput['sections'][number], 'kind' | 'textRef'>>,
  kinds: string[],
  limit = 3
) {
  return sections
    .filter((section) => kinds.includes(section.kind))
    .map((section) => section.textRef.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function countSignalMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function resolveDocTypeFromText(text: string) {
  const scores = Object.entries(DOC_TYPE_SIGNAL_PATTERNS).map(([docType, patterns]) => ({
    docType: docType as DocumentClassificationDecisionContract['docType'],
    score: countSignalMatches(text, patterns),
  }));
  scores.sort((left, right) => right.score - left.score);
  return scores[0]?.score ? scores[0].docType : ('policy' as const);
}

function normalizeChunkStrategy(value: unknown, fallback: 'section' | 'faq' | 'clause' | 'row') {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('row')) {
    return 'row' as const;
  }
  if (text.includes('faq')) {
    return 'faq' as const;
  }
  if (text.includes('clause') || text.includes('contract')) {
    return 'clause' as const;
  }
  if (text.includes('section')) {
    return 'section' as const;
  }
  return fallback;
}

function normalizeConfidence(value: unknown) {
  const text = String(value ?? '').toLowerCase();
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    if (numeric >= 0.8) {
      return 'high' as const;
    }
    if (numeric >= 0.5) {
      return 'medium' as const;
    }
    return 'low' as const;
  }
  if (text.includes('high')) {
    return 'high' as const;
  }
  if (text.includes('medium')) {
    return 'medium' as const;
  }
  return 'low' as const;
}

function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        const candidate = item as Record<string, unknown>;
        return String(candidate.name ?? candidate.label ?? candidate.text ?? candidate.value ?? '');
      }
      return String(item ?? '');
    })
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function buildDocumentClassificationFeatures(
  input: DocumentClassificationInput
): DocumentClassificationFeatureSummary {
  const sectionKindCounts = input.sections.reduce<Record<string, number>>((acc, section) => {
    acc[section.kind] = (acc[section.kind] ?? 0) + 1;
    return acc;
  }, {});
  const totalSections = input.sections.length || 1;
  const previewSnippets = extractPreviewSnippets(input.previewText);
  const sampleRows = sampleSectionTexts(input.sections, ['row_block', 'table']);
  const sampleHeadings = sampleSectionTexts(input.sections, ['heading']);
  const sampleFaqBlocks = sampleSectionTexts(input.sections, ['faq_block']);
  const sampleClauseBlocks = sampleSectionTexts(input.sections, ['clause_block']);
  const lexicalText = [
    input.originalFilename,
    input.previewText ?? '',
    ...sampleRows,
    ...sampleHeadings,
    ...sampleFaqBlocks,
    ...sampleClauseBlocks,
  ]
    .join('\n')
    .toLowerCase();

  return {
    sectionKindCounts,
    densitySignals: {
      headingDensity: ((sectionKindCounts.heading ?? 0) / totalSections).toFixed(2),
      faqPairDensity: (countQuestionLikeSections(input.sections) / totalSections).toFixed(2),
      clausePatternDensity: (countClauseLikeSections(input.sections) / totalSections).toFixed(2),
      rowTableDensity: (((sectionKindCounts.row_block ?? 0) + (sectionKindCounts.table ?? 0)) / totalSections).toFixed(2),
    },
    carrierHints: {
      tabularCarrier:
        input.parserStrategy === 'xlsx' ||
        ((sectionKindCounts.row_block ?? 0) + (sectionKindCounts.table ?? 0)) / totalSections >= 0.4,
      faqCarrier:
        (sectionKindCounts.faq_block ?? 0) / totalSections >= 0.2 ||
        countQuestionLikeSections(input.sections) / totalSections >= 0.25,
      clauseCarrier:
        (sectionKindCounts.clause_block ?? 0) / totalSections >= 0.15 ||
        countClauseLikeSections(input.sections) / totalSections >= 0.2,
      headingStructured: (sectionKindCounts.heading ?? 0) / totalSections >= 0.15,
    },
    sampleRows,
    sampleHeadings,
    sampleFaqBlocks,
    sampleClauseBlocks,
    previewSnippets,
    lexicalSignalCounts: {
      faq: countSignalMatches(lexicalText, DOC_TYPE_SIGNAL_PATTERNS.faq),
      policy: countSignalMatches(lexicalText, DOC_TYPE_SIGNAL_PATTERNS.policy),
      contract: countSignalMatches(lexicalText, DOC_TYPE_SIGNAL_PATTERNS.contract),
      questionnaire: countSignalMatches(lexicalText, DOC_TYPE_SIGNAL_PATTERNS.questionnaire),
      product_doc: countSignalMatches(lexicalText, DOC_TYPE_SIGNAL_PATTERNS.product_doc),
    },
  };
}

export function buildDocumentClassificationPrompt(input: DocumentClassificationInput) {
  const features = buildDocumentClassificationFeatures(input);

  return [
    'You are semantically classifying a parsed document for an enterprise ingestion workflow.',
    'Return a JSON object with exactly these keys: docType, initialChunkingHypothesis, priorityFeatures.',
    'Do not infer parserStrategy. parserStrategy is already resolved by the system and is only context.',
    'Classify by semantic content, not by file format.',
    'Doc type definitions:',
    '- faq: question-answer knowledge intended to directly answer user questions. Use only when Q/A pairs dominate the document.',
    '- policy: organizational or internal rules, manuals, handbooks, procedures, HR/process guidance, or governance content.',
    '- contract: legal agreement content describing rights, obligations, clauses, definitions, warranties, or other legal terms.',
    '- questionnaire: checklist, assessment, form, control sheet, or tabular collection where rows are independent items to evaluate, fill, or verify.',
    '- product_doc: product/help/reference/tutorial/troubleshooting or taxonomy/reference content about a product, platform, or feature.',
    'Tie-break rules:',
    '- For xlsx or other tabular carriers, classify by semantic content, not by the fact that it is a spreadsheet.',
    '- Tabular contract excerpts, clause labels, legal obligations, rights, or filename-to-clause mappings should still be contract.',
    '- Tabular checklist/control/status/evidence rows should be questionnaire.',
    '- Taxonomy/catalog/mapping/reference tables about product entities should be product_doc.',
    '- Internal policy manuals and employee handbooks are policy, not product_doc.',
    '- Product guides, troubleshooting pages, and feature references are product_doc, not policy.',
    '- initialChunkingHypothesis is only the first chunking guess. For row-dominant tabular carriers, keep row even when docType is contract or product_doc.',
    `parserStrategy: ${input.parserStrategy}`,
    `mimeType: ${input.mimeType}`,
    `originalFilename: ${input.originalFilename}`,
    `sectionCount: ${input.sectionCount ?? input.sections.length}`,
    `sampledSectionCount: ${input.sampledSectionCount ?? input.sections.length}`,
    `featureSummary: ${JSON.stringify(features)}`,
    `previewText: ${input.previewText ?? ''}`,
  ].join('\n');
}

export function repairDocumentClassificationDecision(
  value: unknown,
  input: DocumentClassificationInput
): DocumentClassificationDecisionContract {
  const candidate = (value ?? {}) as Record<string, unknown>;
  const candidateDocType = resolveDocTypeFromText(
    String(candidate.docType ?? candidate.documentType ?? candidate.category ?? '')
  );
  const features = buildDocumentClassificationFeatures(input);
  const lexical = features.lexicalSignalCounts;
  const docType =
    features.carrierHints.tabularCarrier &&
    lexical.contract >= 2 &&
    lexical.contract >= Math.max(lexical.policy, lexical.questionnaire, lexical.product_doc)
      ? ('contract' as const)
      : features.carrierHints.clauseCarrier &&
          lexical.contract >= 2 &&
          lexical.contract >= Math.max(lexical.policy, lexical.questionnaire, lexical.product_doc)
        ? ('contract' as const)
      : features.carrierHints.tabularCarrier &&
          lexical.questionnaire >= 2 &&
          lexical.questionnaire > Math.max(lexical.contract, lexical.product_doc)
        ? ('questionnaire' as const)
        : features.carrierHints.tabularCarrier &&
            lexical.product_doc >= 2 &&
            lexical.product_doc > Math.max(lexical.contract, lexical.questionnaire)
          ? ('product_doc' as const)
          : candidateDocType;
  const preferredInitialChunkingHypothesis =
    input.parserStrategy === 'xlsx'
      ? ('row' as const)
      : docType === 'faq'
        ? ('faq' as const)
        : docType === 'questionnaire'
          ? ('row' as const)
          : docType === 'contract' && features.carrierHints.clauseCarrier
            ? ('clause' as const)
            : docType === 'contract'
              ? ('clause' as const)
              : ('section' as const);
  const normalizedInitialChunkingHypothesis =
    input.parserStrategy === 'xlsx'
      ? ('row' as const)
      : normalizeChunkStrategy(candidate.initialChunkingHypothesis, preferredInitialChunkingHypothesis);
  const initialChunkingHypothesis =
    docType === 'contract' &&
    features.carrierHints.clauseCarrier &&
    normalizedInitialChunkingHypothesis === 'section'
      ? ('clause' as const)
      : normalizedInitialChunkingHypothesis;

  return {
    docType,
    initialChunkingHypothesis,
    priorityFeatures:
      Array.isArray(candidate.priorityFeatures) && candidate.priorityFeatures.length > 0
        ? normalizeStringArray(candidate.priorityFeatures, 5)
        : input.parserStrategy === 'xlsx'
          ? ['table', 'rows']
          : docType === 'contract'
            ? ['clauses']
            : docType === 'questionnaire'
              ? ['checklist']
              : docType === 'product_doc'
                ? ['reference']
                : ['sections'],
  };
}

async function generateStructuredDecision<T>({
  schema,
  prompt,
  repair,
}: {
  schema: z.ZodType<T>;
  prompt: string;
  repair: (value: unknown) => T;
}): Promise<T> {
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema,
      prompt,
      temperature: 0,
    });

    return object;
  } catch (error) {
    const candidateText =
      error && typeof error === 'object' && 'text' in error ? String(error.text ?? '') : '';

    if (candidateText) {
      try {
        return schema.parse(repair(parseJsonCandidate(candidateText)));
      } catch {
        // Fall through to explicit JSON generation.
      }
    }

    const { text } = await generateText({
      model: getModel(),
      prompt: `${prompt}\nReturn only a single JSON object that matches the required schema.`,
      temperature: 0,
    });

    return schema.parse(repair(parseJsonCandidate(text)));
  }
}

function summarizeSections(input: ChunkStrategyDecisionInput) {
  const counts = input.sections.reduce<Record<string, number>>((acc, section) => {
    acc[section.kind] = (acc[section.kind] ?? 0) + 1;
    return acc;
  }, {});

  return JSON.stringify(counts);
}

function buildStrategySignals(input: ChunkStrategyDecisionInput) {
  const features = buildDocumentClassificationFeatures({
    parserStrategy: input.parserStrategy,
    mimeType: '',
    originalFilename: '',
    previewText: input.previewText,
    sectionCount: input.sectionCount,
    sampledSectionCount: input.sampledSectionCount,
    sections: input.sections,
  });

  return {
    headingDensity: features.densitySignals.headingDensity,
    faqPairDensity: features.densitySignals.faqPairDensity,
    clausePatternDensity: features.densitySignals.clausePatternDensity,
    rowTableDensity: features.densitySignals.rowTableDensity,
    previewSnippets: features.previewSnippets.join(' | '),
    sampleRows: features.sampleRows,
    sampleHeadings: features.sampleHeadings,
    sampleFaqBlocks: features.sampleFaqBlocks,
    sampleClauseBlocks: features.sampleClauseBlocks,
    lexicalSignalCounts: features.lexicalSignalCounts,
  };
}

export function buildChunkStrategyPrompt(input: ChunkStrategyDecisionInput) {
  const signals = buildStrategySignals(input);

  return [
    'You are choosing the best chunking strategy for enterprise ingestion.',
    'Return a JSON object with exactly these keys: chunkingStrategy, confidence, reason, fallbackStrategy.',
    'Chunk strategy definitions:',
    '- section: preserve a topical section with its heading/body paragraphs as one knowledge unit.',
    '- faq: preserve one question-answer pair as one knowledge unit.',
    '- clause: preserve one contract clause, legal definition, or legal provision as one knowledge unit.',
    '- row: preserve one table or spreadsheet row as one knowledge unit.',
    'Tie-break rules:',
    '- docType informs but does not override observed structure.',
    '- If row/table blocks dominate, choose row even when docType is contract or product_doc.',
    '- If faq pairs dominate, choose faq.',
    '- If clause blocks or legal provisions dominate, choose clause.',
    '- If headings/paragraph sections dominate without a stronger carrier, choose section.',
    `parserStrategy: ${input.parserStrategy}`,
    `docType: ${input.docType ?? 'unknown'}`,
    `initialChunkingHypothesis: ${input.initialChunkingHypothesis ?? 'section'}`,
    `priorityFeatures: ${(input.priorityFeatures ?? []).join(',')}`,
    `sectionCount: ${input.sectionCount ?? input.sections.length}`,
    `sampledSectionCount: ${input.sampledSectionCount ?? input.sections.length}`,
    `sectionKindCounts: ${summarizeSections(input)}`,
    `headingDensity: ${signals.headingDensity}`,
    `faqPairDensity: ${signals.faqPairDensity}`,
    `clausePatternDensity: ${signals.clausePatternDensity}`,
    `rowTableDensity: ${signals.rowTableDensity}`,
    `lexicalSignalCounts: ${JSON.stringify(signals.lexicalSignalCounts)}`,
    `sampleHeadings: ${signals.sampleHeadings.join(' | ')}`,
    `sampleFaqBlocks: ${signals.sampleFaqBlocks.join(' | ')}`,
    `sampleClauseBlocks: ${signals.sampleClauseBlocks.join(' | ')}`,
    `sampleRows: ${signals.sampleRows.join(' | ')}`,
    `sourcePreviewSnippets: ${signals.previewSnippets}`,
  ].join('\n');
}

export function createGptStructuredDecisionProvider(): IngestionDecisionProvider {
  return {
    async classifyDocument(input) {
      return generateStructuredDecision({
        schema: documentClassificationSchema,
        prompt: buildDocumentClassificationPrompt(input),
        repair: (value) => repairDocumentClassificationDecision(value, input),
      });
    },
    async chooseChunkStrategy(input) {
      return generateStructuredDecision({
        schema: chunkStrategySchema,
        prompt: buildChunkStrategyPrompt(input),
        repair: (value) => {
          const candidate = (value ?? {}) as Record<string, unknown>;
          const fallbackStrategy = input.initialChunkingHypothesis ?? 'section';
          const suggestedStrategy = normalizeChunkStrategy(
            candidate.chunkingStrategy ?? candidate.strategy ?? candidate.recommendedStrategy,
            fallbackStrategy
          );
          const signals = buildStrategySignals(input);
          const chunkingStrategy =
            Number(signals.rowTableDensity) >= 0.45
              ? 'row'
              : Number(signals.faqPairDensity) >= 0.25
                ? 'faq'
                : Number(signals.clausePatternDensity) >= 0.2
                  ? 'clause'
                  : suggestedStrategy;
          return {
            chunkingStrategy,
            confidence: normalizeConfidence(candidate.confidence),
            reason:
              candidate.reason === 'row_block_dominant' ||
              candidate.reason === 'faq_block_dominant' ||
              candidate.reason === 'clause_block_dominant' ||
              candidate.reason === 'doc_type_faq' ||
              candidate.reason === 'doc_type_contract' ||
              candidate.reason === 'fallback_to_section' ||
              candidate.reason === 'manual_override'
                ? candidate.reason
                : chunkingStrategy === 'row'
                  ? 'row_block_dominant'
                  : chunkingStrategy === 'faq'
                    ? 'faq_block_dominant'
                    : chunkingStrategy === 'clause'
                      ? 'clause_block_dominant'
                      : 'fallback_to_section',
            fallbackStrategy,
          };
        },
      });
    },
    async enrichChunk(chunk) {
      return generateStructuredDecision({
        schema: enrichmentSchema,
        prompt: [
          'You are enriching a chunk for an enterprise knowledge ingestion workflow.',
          'Return a JSON object with exactly these keys: title, summary, keywords, entities, questionsAnswered, versionGuess, authorityLevel, reviewHints.',
          `chunkStrategy: ${chunk.chunkStrategy}`,
          `cleanText: ${chunk.cleanText.slice(0, 2000)}`,
        ].join('\n'),
        repair: (value) => {
          const candidate = (value ?? {}) as Record<string, unknown>;
          return {
            title: String(candidate.title ?? chunk.cleanText.slice(0, 60)),
            summary: String(candidate.summary ?? chunk.cleanText.slice(0, 160)),
            keywords: normalizeStringArray(candidate.keywords, 8),
            entities: normalizeStringArray(candidate.entities, 8),
            questionsAnswered: normalizeStringArray(candidate.questionsAnswered, 6),
            versionGuess: candidate.versionGuess ? String(candidate.versionGuess) : undefined,
            authorityLevel:
              candidate.authorityLevel === 'low' ||
              candidate.authorityLevel === 'medium' ||
              candidate.authorityLevel === 'high'
                ? candidate.authorityLevel
                : undefined,
            reviewHints: normalizeStringArray(candidate.reviewHints, 6),
          };
        },
      });
    },
    async routeReviewTask(input) {
      return generateStructuredDecision({
        schema: reviewRoutingSchema,
        prompt: [
          'You are routing a review task for enterprise ingestion governance.',
          'Return a JSON object with exactly these keys: taskType, reasonCodes, summary, suggestedAction, assignee, owner.',
          `validationCode: ${input.issue.code}`,
          `severity: ${input.issue.severity}`,
          `validationTier: ${input.issue.validationTier}`,
          `message: ${input.issue.message}`,
          `chunkText: ${input.chunk?.cleanText?.slice(0, 1200) ?? ''}`,
        ].join('\n'),
        repair: (value) => {
          const candidate = (value ?? {}) as Record<string, unknown>;
          const taskType =
            candidate.taskType === 'document_review' ||
            candidate.taskType === 'chunk_review' ||
            candidate.taskType === 'metadata_review' ||
            candidate.taskType === 'strategy_review'
              ? candidate.taskType
              : input.issue.chunkId
                ? 'chunk_review'
                : 'document_review';
          const suggestedAction =
            candidate.suggestedAction === 'approve' ||
            candidate.suggestedAction === 'edit' ||
            candidate.suggestedAction === 'reject'
              ? candidate.suggestedAction
              : input.issue.code === 'POSSIBLE_PROMPT_INJECTION'
                ? 'reject'
                : 'edit';
          return {
            taskType,
            reasonCodes:
              normalizeStringArray(candidate.reasonCodes, 4).length > 0
                ? normalizeStringArray(candidate.reasonCodes, 4)
                : [input.issue.code],
            summary: String(candidate.summary ?? input.issue.message),
            suggestedAction,
            assignee: candidate.assignee ? String(candidate.assignee) : undefined,
            owner: candidate.owner ? String(candidate.owner) : undefined,
          };
        },
      });
    },
  };
}

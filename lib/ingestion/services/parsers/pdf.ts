import { randomUUID } from 'node:crypto';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import { normalizeSectionsForChunking } from '../section-normalization';
import type { ParsedDocumentResult } from './xlsx';
import { extractPdfLayoutWithPyMuPdf, type PdfLayoutBlock } from './pymupdf';

const HEADING_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

function normalizePdfText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export function isPdfMetadataBoilerplate(text: string) {
  const normalized = normalizePdfText(text);
  return (
    /^last updated by\b/i.test(normalized) ||
    /^\d{2}\/\d{2}\/\d{4}\b.*\boverview$/i.test(normalized)
  );
}

function isPageArtifactBlock(text: string) {
  const normalized = normalizePdfText(text);
  return (
    /^\d+$/.test(normalized) ||
    /^--\s*\d+\s+of\s+\d+\s*--$/i.test(normalized) ||
    /^copyright\s+©?\s*\d{4}.*page\s+\d+\s+of\s+\d+/i.test(normalized) ||
    isPdfMetadataBoilerplate(normalized)
  );
}

function isListItem(text: string) {
  return /^[•\-–*]\s+/.test(text) || /^\d+(\.\d+)*[\).\s-]/.test(text);
}

function isHeadingBlock(block: PdfLayoutBlock, medianRegularFontSize: number) {
  const normalized = normalizePdfText(block.text);
  if (!normalized || isPageArtifactBlock(normalized)) {
    return false;
  }

  if (normalized.length > 120 || normalized.split(/\s+/).length > 12) {
    return false;
  }

  if (isListItem(normalized)) {
    return false;
  }

  if (/[.!?]$/.test(normalized)) {
    return false;
  }

  if (/\b(and|or|of|for|to|the|a|an|with|&|-)$/.test(normalized.toLowerCase())) {
    return false;
  }

  const firstLetter = normalized.match(/[A-Za-z]/)?.[0];
  if (firstLetter && firstLetter !== firstLetter.toUpperCase()) {
    return false;
  }

  const words = normalized
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
    .filter(Boolean);
  const significantWords = words.filter((word) => !HEADING_STOP_WORDS.has(word.toLowerCase()));
  const titleCaseWords = significantWords.filter((word) => /^[A-Z][A-Za-z0-9'()/-]*$/.test(word));
  const looksLikeTitleCase =
    significantWords.length === 0 || titleCaseWords.length / significantWords.length >= 0.6;
  const boldOrLargerThanBody =
    block.allBold || block.boldRatio >= 0.85 || block.maxFontSize >= medianRegularFontSize + 1;

  return looksLikeTitleCase && boldOrLargerThanBody;
}

function buildSectionsFromPdfLayout(
  documentId: string,
  blocks: PdfLayoutBlock[],
  medianRegularFontSize: number
) {
  const sections: SectionContract[] = [];
  let paragraphIndex = 0;

  for (const block of blocks) {
    const textRef = normalizePdfText(block.text);
    if (!textRef || isPageArtifactBlock(textRef)) {
      continue;
    }

    paragraphIndex += 1;
    const kind = isHeadingBlock(block, medianRegularFontSize) ? 'heading' : 'paragraph_block';

    sections.push({
      sectionId: randomUUID(),
      documentId,
      kind,
      title: kind === 'heading' ? textRef : undefined,
      level: kind === 'heading' ? 1 : undefined,
      textRef,
      span: {
        page: block.page,
        paragraphStart: paragraphIndex,
        paragraphEnd: paragraphIndex,
      },
    });
  }

  return sections;
}

export async function parsePdfDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const layout = await extractPdfLayoutWithPyMuPdf(sourceUri);
  const sections = buildSectionsFromPdfLayout(
    documentId,
    layout.blocks,
    layout.medianRegularFontSize || 9.96
  );
  const normalizedSections = normalizeSectionsForChunking(sections);

  const document: DocumentContract = {
    documentId,
    sourceUri,
    mimeType: 'application/pdf',
    docType: normalizedSections.some((section) => section.kind === 'clause_block') ? 'contract' : 'policy',
    pageCount: layout.pageCount,
    sectionCount: normalizedSections.length,
  };

  return { document, sections: normalizedSections };
}

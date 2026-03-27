import type { SectionContract, SourceSpanContract } from '../contracts/section';

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function isLikelyQuestion(text: string) {
  const normalized = normalizeText(text);
  return (
    /^(q|question)\s*[:：-]\s*/i.test(normalized) ||
    (/[?？]$/.test(normalized) && normalized.length <= 220)
  );
}

function isLikelyClauseStart(text: string) {
  const normalized = normalizeText(text);
  const hasContractLanguage = /\b(agreement|party|recipient|disclosing|disclosure|confidential|effective date|whereas|therefore)\b/i.test(
    normalized
  );
  return (
    (/^\d+(\.\d+)*[\).\s-]/.test(normalized) && hasContractLanguage) ||
    /^(section|clause|article)\s+\d+/i.test(normalized) ||
    /^(whereas|now,\s*therefore)\b/i.test(normalized)
  );
}

function mergeSpans(first: SourceSpanContract, last: SourceSpanContract): SourceSpanContract {
  return {
    page: first.page ?? last.page,
    sheetName: first.sheetName ?? last.sheetName,
    rowStart: first.rowStart ?? last.rowStart,
    rowEnd: last.rowEnd ?? first.rowEnd,
    paragraphStart: first.paragraphStart ?? last.paragraphStart,
    paragraphEnd: last.paragraphEnd ?? first.paragraphEnd,
    charStart: first.charStart ?? last.charStart,
    charEnd: last.charEnd ?? first.charEnd,
  };
}

function canMergeIntoComposite(section: SectionContract) {
  return section.kind === 'paragraph_block' || section.kind === 'heading';
}

export function normalizeSectionsForChunking(sections: SectionContract[]): SectionContract[] {
  const normalized: SectionContract[] = [];
  let index = 0;

  while (index < sections.length) {
    const current = sections[index];

    if (!canMergeIntoComposite(current)) {
      normalized.push(current);
      index += 1;
      continue;
    }

    if (isLikelyQuestion(current.textRef)) {
      let cursor = index + 1;
      const answerSections: SectionContract[] = [];

      while (cursor < sections.length) {
        const candidate = sections[cursor];
        if (!canMergeIntoComposite(candidate)) {
          break;
        }
        if (
          answerSections.length > 0 &&
          (isLikelyQuestion(candidate.textRef) || isLikelyClauseStart(candidate.textRef))
        ) {
          break;
        }
        if (candidate.kind === 'heading' && answerSections.length > 0) {
          break;
        }
        answerSections.push(candidate);
        cursor += 1;
      }

      if (answerSections.length > 0) {
        const answerText = answerSections
          .map((section) => normalizeText(section.textRef))
          .filter(Boolean)
          .join(' ');

        normalized.push({
          ...current,
          kind: 'faq_block',
          textRef: `Q: ${normalizeText(current.textRef)}\nA: ${answerText}`,
          span: mergeSpans(current.span, answerSections[answerSections.length - 1]!.span),
        });
        index = cursor;
        continue;
      }
    }

    if (isLikelyClauseStart(current.textRef)) {
      let cursor = index + 1;
      const clauseSections: SectionContract[] = [current];

      while (cursor < sections.length) {
        const candidate = sections[cursor];
        if (!canMergeIntoComposite(candidate)) {
          break;
        }
        if (isLikelyQuestion(candidate.textRef) || isLikelyClauseStart(candidate.textRef)) {
          break;
        }
        if (candidate.kind === 'heading') {
          break;
        }
        clauseSections.push(candidate);
        cursor += 1;
      }

      normalized.push({
        ...current,
        kind: 'clause_block',
        textRef: clauseSections.map((section) => normalizeText(section.textRef)).join(' '),
        span: mergeSpans(current.span, clauseSections[clauseSections.length - 1]!.span),
      });
      index = cursor;
      continue;
    }

    normalized.push(current);
    index += 1;
  }

  return normalized;
}

export function countQuestionLikeSections(
  sections: Array<Pick<SectionContract, 'kind' | 'textRef'>>
) {
  return sections.filter(
    (section) => section.kind === 'faq_block' || isLikelyQuestion(section.textRef)
  ).length;
}

export function countClauseLikeSections(
  sections: Array<Pick<SectionContract, 'kind' | 'textRef'>>
) {
  return sections.filter(
    (section) => section.kind === 'clause_block' || isLikelyClauseStart(section.textRef)
  ).length;
}

export function extractPreviewSnippets(previewText?: string) {
  return (previewText ?? '')
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .slice(0, 6);
}

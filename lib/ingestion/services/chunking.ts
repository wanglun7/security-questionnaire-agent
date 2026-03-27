import { randomUUID } from 'node:crypto';
import type { ChunkTaskContract } from '../contracts/chunk';
import type { SectionContract, SourceSpanContract } from '../contracts/section';

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

function toTask(
  documentId: string,
  chunkingStrategy: ChunkTaskContract['chunkingStrategy'],
  sectionId: string | undefined,
  textRef: string,
  span: SourceSpanContract
): ChunkTaskContract {
  return {
    taskId: randomUUID(),
    documentId,
    sectionId,
    chunkingStrategy,
    textRef,
    span,
  };
}

export function isMeaningfulRow(section: SectionContract) {
  const normalized = section.textRef
    .split('|')
    .map((cell) => cell.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.length === 0) {
    return false;
  }

  const headerTerms = new Set([
    'question',
    'questions',
    'id',
    'month',
    'months',
    'listmonth',
    'listmonths',
    'answer',
    'answers',
    'control',
    'controls',
    'status',
    'description',
    'value',
    'field',
  ]);

  const looksLikeFirstRowLabels =
    section.span.rowStart === 1 &&
    normalized.length >= 2 &&
    normalized.every(
      (cell) =>
        /^[a-z][a-z0-9 _-]{0,24}$/.test(cell) &&
        !/\d{2,}|[?!.:]/.test(cell) &&
        cell.split(/\s+/).length <= 3
    );

  if (looksLikeFirstRowLabels) {
    return false;
  }

  return !normalized.every((cell) => headerTerms.has(cell));
}

function buildRowChunkTasks(documentId: string, sections: SectionContract[]) {
  return sections
    .filter((section) => section.kind === 'row_block' && isMeaningfulRow(section))
    .map((section) =>
      toTask(documentId, 'row', section.sectionId, section.textRef, section.span)
    );
}

function buildBlockChunkTasks(
  documentId: string,
  sections: SectionContract[],
  kind: 'faq_block' | 'clause_block'
) {
  const strategy = kind === 'faq_block' ? 'faq' : 'clause';
  return sections
    .filter((section) => section.kind === kind)
    .map((section) =>
      toTask(documentId, strategy, section.sectionId, section.textRef, section.span)
    );
}

function buildSectionChunkTasks(documentId: string, sections: SectionContract[]) {
  const tasks: ChunkTaskContract[] = [];
  let currentHeading: SectionContract | undefined;
  let bodySections: SectionContract[] = [];

  function pushCurrentSectionChunk() {
    if (currentHeading) {
      const composedSections = [currentHeading, ...bodySections];
      const composedText = composedSections.map((section) => section.textRef.trim()).join('\n\n').trim();
      if (composedText) {
        tasks.push(
          toTask(
            documentId,
            'section',
            currentHeading.sectionId,
            composedText,
            mergeSpans(currentHeading.span, composedSections[composedSections.length - 1]!.span)
          )
        );
      }
      currentHeading = undefined;
      bodySections = [];
      return;
    }

    for (const section of bodySections) {
      if (section.kind !== 'heading' && section.textRef.trim()) {
        tasks.push(toTask(documentId, 'section', section.sectionId, section.textRef, section.span));
      }
    }
    bodySections = [];
  }

  for (const section of sections) {
    if (section.kind === 'heading') {
      pushCurrentSectionChunk();
      currentHeading = section;
      continue;
    }

    bodySections.push(section);
  }

  pushCurrentSectionChunk();

  return tasks;
}

export function buildChunkTasks({
  documentId,
  chunkingStrategy,
  sections,
}: {
  documentId: string;
  chunkingStrategy: ChunkTaskContract['chunkingStrategy'];
  sections: SectionContract[];
}): ChunkTaskContract[] {
  if (chunkingStrategy === 'row') {
    return buildRowChunkTasks(documentId, sections);
  }

  if (chunkingStrategy === 'faq') {
    return buildBlockChunkTasks(documentId, sections, 'faq_block');
  }

  if (chunkingStrategy === 'clause') {
    return buildBlockChunkTasks(documentId, sections, 'clause_block');
  }

  return buildSectionChunkTasks(documentId, sections);
}

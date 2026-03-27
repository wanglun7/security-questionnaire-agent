import { randomUUID } from 'node:crypto';
import mammoth from 'mammoth';
import { load } from 'cheerio';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import { normalizeSectionsForChunking } from '../section-normalization';
import type { ParsedDocumentResult } from './xlsx';

export async function parseDocxDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const result = await mammoth.convertToHtml({ path: sourceUri });
  const $ = load(result.value);
  const sections: SectionContract[] = [];

  $('h1, h2, h3, p, li, table').each((index, element) => {
    const text = $(element).text().trim();
    if (!text) {
      return;
    }

    const tagName = element.tagName.toLowerCase();
    const isHeading = tagName.startsWith('h');
    sections.push({
      sectionId: randomUUID(),
      documentId,
      kind: isHeading ? 'heading' : tagName === 'table' ? 'table' : 'paragraph_block',
      title: isHeading ? text : undefined,
      level: isHeading ? Number.parseInt(tagName.slice(1), 10) : undefined,
      textRef: text,
      span: {
        paragraphStart: index + 1,
        paragraphEnd: index + 1,
      },
    });
  });

  const normalizedSections = normalizeSectionsForChunking(sections);

  const document: DocumentContract = {
    documentId,
    sourceUri,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    docType: 'policy',
    sectionCount: normalizedSections.length,
  };

  return { document, sections: normalizedSections };
}

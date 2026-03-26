import fs from 'node:fs/promises';
import { load } from 'cheerio';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import type { ParsedDocumentResult } from './xlsx';

export async function parseHtmlDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const html = await fs.readFile(sourceUri, 'utf8');
  const $ = load(html);
  const sections: SectionContract[] = [];

  $('h1, h2, h3, p, li, table').each((index, element) => {
    const text = $(element).text().trim();
    if (!text) {
      return;
    }

    const tagName = element.tagName.toLowerCase();
    sections.push({
      sectionId: `${documentId}-${tagName}-${index + 1}`,
      documentId,
      kind: tagName.startsWith('h') ? 'heading' : tagName === 'table' ? 'table' : 'paragraph_block',
      textRef: text,
      span: {
        paragraphStart: index + 1,
        paragraphEnd: index + 1,
      },
    });
  });

  const document: DocumentContract = {
    documentId,
    sourceUri,
    mimeType: 'text/html',
    docType: 'product_doc',
    sectionCount: sections.length,
  };

  return { document, sections };
}

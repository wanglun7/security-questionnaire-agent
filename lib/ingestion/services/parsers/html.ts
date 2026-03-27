import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { load } from 'cheerio';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import { normalizeSectionsForChunking } from '../section-normalization';
import type { ParsedDocumentResult } from './xlsx';

function selectHtmlContentRoot(html: string) {
  const $ = load(html);
  const root =
    $('#layout-content').first().length > 0
      ? $('#layout-content').first()
      : $('main').first().length > 0
        ? $('main').first()
        : $('article').first().length > 0
          ? $('article').first()
          : $('body').first();

  root.find(
    [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      'aside',
      '#breadcrumbs',
      '.breadcrumbs',
      '.contribute',
      '#usernotes',
      '.qandaset_questions',
      '.layout-menu',
      '.parent-menu-list',
      '.child-menu-list',
      '.change-language',
      '.related',
      '.toc',
      '.tableofcontents',
    ].join(',')
  ).remove();

  return { $, root };
}

export async function parseHtmlDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const html = await fs.readFile(sourceUri, 'utf8');
  const { $, root } = selectHtmlContentRoot(html);
  const sections: SectionContract[] = [];

  root
    .find('h1, h2, h3, dt, dd, p, li, table')
    .each((index, element) => {
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
    mimeType: 'text/html',
    docType: normalizedSections.some((section) => section.kind === 'faq_block') ? 'faq' : 'product_doc',
    sectionCount: normalizedSections.length,
  };

  return { document, sections: normalizedSections };
}

import fs from 'node:fs/promises';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import type { ParsedDocumentResult } from './xlsx';

export async function parsePdfDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const buffer = await fs.readFile(sourceUri);
  const pdfParseModule = await import('pdf-parse');
  const parsePdf =
    ((pdfParseModule as unknown as { default?: unknown }).default ??
      (pdfParseModule as unknown)) as (input: Buffer) => Promise<{ text: string; numpages: number }>;
  const result = await parsePdf(buffer);
  const lines = result.text
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);

  const sections: SectionContract[] = lines.map((line: string, index: number) => ({
    sectionId: `${documentId}-paragraph-${index + 1}`,
    documentId,
    kind: 'paragraph_block',
    textRef: line,
    span: {
      page: 1,
      paragraphStart: index + 1,
      paragraphEnd: index + 1,
    },
  }));

  const document: DocumentContract = {
    documentId,
    sourceUri,
    mimeType: 'application/pdf',
    docType: 'policy',
    pageCount: result.numpages,
    sectionCount: sections.length,
  };

  return { document, sections };
}

import mammoth from 'mammoth';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import type { ParsedDocumentResult } from './xlsx';

export async function parseDocxDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const result = await mammoth.extractRawText({ path: sourceUri });
  const lines = result.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: SectionContract[] = lines.map((line, index) => ({
    sectionId: `${documentId}-paragraph-${index + 1}`,
    documentId,
    kind: 'paragraph_block',
    textRef: line,
    span: {
      paragraphStart: index + 1,
      paragraphEnd: index + 1,
    },
  }));

  const document: DocumentContract = {
    documentId,
    sourceUri,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    docType: 'policy',
    sectionCount: sections.length,
  };

  return { document, sections };
}

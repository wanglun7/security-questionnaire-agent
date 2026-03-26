import XLSX from 'xlsx';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';

export type ParsedDocumentResult = {
  document: DocumentContract;
  sections: SectionContract[];
};

export async function parseXlsxDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const workbook = XLSX.readFile(sourceUri);
  const sections: SectionContract[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      blankrows: false,
    });

    rows.forEach((row, index) => {
      const text = row.map((cell) => `${cell ?? ''}`.trim()).filter(Boolean).join(' | ');

      sections.push({
        sectionId: `${documentId}-${sheetName}-row-${index + 1}`,
        documentId,
        kind: 'row_block',
        textRef: text,
        span: {
          sheetName,
          rowStart: index + 1,
          rowEnd: index + 1,
        },
      });
    });
  }

  return {
    document: {
      documentId,
      sourceUri,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      docType: 'questionnaire',
      sectionCount: sections.length,
    },
    sections,
  };
}

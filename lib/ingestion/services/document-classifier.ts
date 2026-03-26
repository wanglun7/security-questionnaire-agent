export type DocumentClassificationInput = {
  mimeType: string;
  originalFilename: string;
  previewText?: string;
};

export type DocumentClassificationResult = {
  docType: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  parserStrategy: 'pdf' | 'docx' | 'xlsx' | 'html';
  chunkingStrategy: 'section' | 'faq' | 'clause' | 'row';
  priorityFeatures: string[];
};

export async function classifyDocument(
  input: DocumentClassificationInput
): Promise<DocumentClassificationResult> {
  const filename = input.originalFilename.toLowerCase();
  const mimeType = input.mimeType.toLowerCase();

  if (mimeType.includes('spreadsheet') || filename.endsWith('.xlsx')) {
    return {
      docType: 'questionnaire',
      parserStrategy: 'xlsx',
      chunkingStrategy: 'row',
      priorityFeatures: ['table'],
    };
  }

  if (mimeType.includes('html') || filename.endsWith('.html') || filename.endsWith('.htm')) {
    return {
      docType: 'product_doc',
      parserStrategy: 'html',
      chunkingStrategy: 'section',
      priorityFeatures: ['dom'],
    };
  }

  if (mimeType.includes('wordprocessingml') || filename.endsWith('.docx')) {
    return {
      docType: 'policy',
      parserStrategy: 'docx',
      chunkingStrategy: 'section',
      priorityFeatures: ['headings'],
    };
  }

  return {
    docType: 'policy',
    parserStrategy: 'pdf',
    chunkingStrategy: 'section',
    priorityFeatures: ['pages'],
  };
}

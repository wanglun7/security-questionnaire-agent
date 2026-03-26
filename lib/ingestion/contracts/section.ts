export type SourceSpanContract = {
  page?: number;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  paragraphStart?: number;
  paragraphEnd?: number;
  charStart?: number;
  charEnd?: number;
};

export type SectionContract = {
  sectionId: string;
  documentId: string;
  parentSectionId?: string;
  title?: string;
  level?: number;
  kind:
    | 'heading'
    | 'paragraph_block'
    | 'table'
    | 'faq_block'
    | 'clause_block'
    | 'row_block';
  textRef: string;
  span: SourceSpanContract;
};

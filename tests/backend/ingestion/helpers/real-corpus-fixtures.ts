import path from 'node:path';

export type RealCorpusExpectation = {
  id: string;
  sourceRelativePath: string;
  originalFilename: string;
  mimeType: string;
  expectedParserStrategy: 'pdf' | 'docx' | 'xlsx' | 'html';
  expectedDocType: 'faq' | 'policy' | 'contract' | 'questionnaire' | 'product_doc';
  expectedChunkingStrategy: 'section' | 'faq' | 'clause' | 'row';
  expectedEnrichLevel: 'L0' | 'L1' | 'L2' | 'L3';
  expectedPromptVariant:
    | 'section_l1'
    | 'section_l2'
    | 'section_l3'
    | 'faq_l1'
    | 'faq_l2'
    | 'faq_l3'
    | 'clause_l1'
    | 'clause_l2'
    | 'clause_l3'
    | 'row_rule'
    | 'row_l1'
    | 'row_l2'
    | 'row_l3';
  expectedShouldCallLlm: boolean;
};

export const REAL_CORPUS_FIXTURES: RealCorpusExpectation[] = [
  {
    id: 'faq-html-sample',
    sourceRelativePath: 'tests/fixtures/ingestion-spec-samples/faq-sample.html',
    originalFilename: 'faq-sample.html',
    mimeType: 'text/html',
    expectedParserStrategy: 'html',
    expectedDocType: 'faq',
    expectedChunkingStrategy: 'faq',
    expectedEnrichLevel: 'L2',
    expectedPromptVariant: 'faq_l2',
    expectedShouldCallLlm: true,
  },
  {
    id: 'hr-manual-docx',
    sourceRelativePath: 'tmp/test-kb-extracts/hr-manual/hr-manual-master/docx/manual.docx',
    originalFilename: 'manual.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    expectedParserStrategy: 'docx',
    expectedDocType: 'policy',
    expectedChunkingStrategy: 'section',
    expectedEnrichLevel: 'L2',
    expectedPromptVariant: 'section_l2',
    expectedShouldCallLlm: true,
  },
  {
    id: 'hr-manual-html',
    sourceRelativePath: 'tmp/test-kb-extracts/hr-manual/hr-manual-master/html/manual.html',
    originalFilename: 'manual.html',
    mimeType: 'text/html',
    expectedParserStrategy: 'html',
    expectedDocType: 'policy',
    expectedChunkingStrategy: 'section',
    expectedEnrichLevel: 'L2',
    expectedPromptVariant: 'section_l2',
    expectedShouldCallLlm: true,
  },
  {
    id: 'hr-manual-pdf',
    sourceRelativePath: 'tmp/test-kb-extracts/hr-manual/hr-manual-master/pdf/manual.pdf',
    originalFilename: 'manual.pdf',
    mimeType: 'application/pdf',
    expectedParserStrategy: 'pdf',
    expectedDocType: 'policy',
    expectedChunkingStrategy: 'section',
    expectedEnrichLevel: 'L2',
    expectedPromptVariant: 'section_l2',
    expectedShouldCallLlm: true,
  },
  {
    id: 'vtex-category-xlsx',
    sourceRelativePath:
      'tmp/test-kb-extracts/vtex-help-center-repo/docs/en/faq/channels/MercadoLivre_CategoriasFixas.xlsx',
    originalFilename: 'MercadoLivre_CategoriasFixas.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedParserStrategy: 'xlsx',
    expectedDocType: 'product_doc',
    expectedChunkingStrategy: 'row',
    expectedEnrichLevel: 'L0',
    expectedPromptVariant: 'row_rule',
    expectedShouldCallLlm: false,
  },
  {
    id: 'vtex-checklist-xlsx',
    sourceRelativePath:
      'tmp/test-kb-extracts/vtex-help-center-repo/docs/en/tracks/vtex-modules-getting-started/go-live/Store_configuration_checklist_EN.xlsx',
    originalFilename: 'Store_configuration_checklist_EN.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedParserStrategy: 'xlsx',
    expectedDocType: 'questionnaire',
    expectedChunkingStrategy: 'row',
    expectedEnrichLevel: 'L0',
    expectedPromptVariant: 'row_rule',
    expectedShouldCallLlm: false,
  },
  {
    id: 'cuad-label-report-xlsx',
    sourceRelativePath:
      'tmp/test-kb-extracts/cuad/CUAD_v1/label_group_xlsx/Label Report - Audit Rights.xlsx',
    originalFilename: 'Label Report - Audit Rights.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedParserStrategy: 'xlsx',
    expectedDocType: 'contract',
    expectedChunkingStrategy: 'row',
    expectedEnrichLevel: 'L0',
    expectedPromptVariant: 'row_rule',
    expectedShouldCallLlm: false,
  },
  {
    id: 'cuad-collaboration-contract-pdf',
    sourceRelativePath:
      'tmp/test-kb-extracts/cuad/CUAD_v1/full_contract_pdf/Part_II/Collaboration/MACROGENICSINC_08_02_2013-EX-10-COLLABORATION AGREEMENT.PDF',
    originalFilename: 'MACROGENICSINC_08_02_2013-EX-10-COLLABORATION AGREEMENT.PDF',
    mimeType: 'application/pdf',
    expectedParserStrategy: 'pdf',
    expectedDocType: 'contract',
    expectedChunkingStrategy: 'clause',
    expectedEnrichLevel: 'L2',
    expectedPromptVariant: 'clause_l2',
    expectedShouldCallLlm: true,
  },
  {
    id: 'cuad-promotion-contract-pdf',
    sourceRelativePath:
      'tmp/test-kb-extracts/cuad/CUAD_v1/full_contract_pdf/Part_II/Promotion/WHITESMOKE,INC_11_08_2011-EX-10.26-PROMOTION AND DISTRIBUTION AGREEMENT.PDF',
    originalFilename: 'WHITESMOKE,INC_11_08_2011-EX-10.26-PROMOTION AND DISTRIBUTION AGREEMENT.PDF',
    mimeType: 'application/pdf',
    expectedParserStrategy: 'pdf',
    expectedDocType: 'contract',
    expectedChunkingStrategy: 'clause',
    expectedEnrichLevel: 'L2',
    expectedPromptVariant: 'clause_l2',
    expectedShouldCallLlm: true,
  },
];

export function resolveRealCorpusPath(relativePath: string) {
  return path.join(process.cwd(), relativePath);
}

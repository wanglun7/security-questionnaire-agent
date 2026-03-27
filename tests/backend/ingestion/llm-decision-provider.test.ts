import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChunkStrategyPrompt,
  buildDocumentClassificationFeatures,
  buildDocumentClassificationPrompt,
  repairChunkEnrichmentDecision,
  repairDocumentClassificationDecision,
} from '../../../lib/ingestion/services/llm-decision-provider';

test('classification prompt explicitly defines doc types and tabular tie-break rules', () => {
  const prompt = buildDocumentClassificationPrompt({
    parserStrategy: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalFilename: 'label-report.xlsx',
    previewText:
      'Filename | Audit Rights\nSample Agreement.pdf | During the Term, and for a period of twelve (12) months thereafter...',
    sectionCount: 12,
    sampledSectionCount: 12,
    sections: [
      { kind: 'row_block', textRef: 'Filename | Audit Rights' },
      {
        kind: 'row_block',
        textRef:
          'Sample Agreement.pdf | During the Term, and for a period of twelve (12) months thereafter...',
      },
      {
        kind: 'row_block',
        textRef:
          'Another Agreement.pdf | Each party may audit the other party’s compliance with this Agreement.',
      },
    ],
  });

  assert.match(prompt, /faq\s*:\s*question-?answer/i);
  assert.match(prompt, /policy\s*:\s*(organizational|internal).*(rules|manual|handbook|process)/i);
  assert.match(prompt, /contract\s*:\s*legal agreement/i);
  assert.match(prompt, /questionnaire\s*:\s*(checklist|assessment|form)/i);
  assert.match(prompt, /product_doc\s*:\s*(product|help|reference|tutorial)/i);
  assert.match(prompt, /do not infer parserStrategy/i);
  assert.match(prompt, /classify by semantic content, not by file format/i);
  assert.match(prompt, /tabular contract excerpts.*contract/i);
  assert.match(prompt, /taxonomy\/catalog\/mapping.*product_doc/i);
});

test('classification feature builder exposes semantic and structural signals for tabular inputs', () => {
  const features = buildDocumentClassificationFeatures({
    parserStrategy: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalFilename: 'audit-rights.xlsx',
    previewText:
      'Filename | Audit Rights\nCybergyHoldingsInc.pdf | MA shall keep accurate records available for review...\nEuromediaHoldingsCorp.pdf | Rogers shall have the right to inspect and/or audit...',
    sectionCount: 272,
    sampledSectionCount: 250,
    sections: [
      { kind: 'row_block', textRef: 'Filename | Audit Rights' },
      {
        kind: 'row_block',
        textRef:
          'CybergyHoldingsInc.pdf | MA shall keep accurate records available for review by a representative of Company.',
      },
      {
        kind: 'row_block',
        textRef:
          'EuromediaHoldingsCorp.pdf | Rogers shall have the right to inspect and/or audit Licensor records.',
      },
    ],
  });

  assert.equal(features.carrierHints.tabularCarrier, true);
  assert.equal(features.sectionKindCounts.row_block, 3);
  assert.ok(features.sampleRows.some((sample: string) => sample.includes('Audit Rights')));
  assert.ok(features.lexicalSignalCounts.contract >= 2);
  assert.ok(features.lexicalSignalCounts.questionnaire === 0);
});

test('classification repair preserves semantic doc type while keeping row chunking for tabular carriers', () => {
  const repaired = repairDocumentClassificationDecision(
    {
      docType: 'legal agreement table',
      initialChunkingHypothesis: 'clause',
      priorityFeatures: ['clauses'],
    },
    {
      parserStrategy: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalFilename: 'label-report.xlsx',
      previewText: 'Filename | Audit Rights',
      sections: [{ kind: 'row_block', textRef: 'Filename | Audit Rights' }],
    }
  );

  assert.equal(repaired.docType, 'contract');
  assert.equal(repaired.initialChunkingHypothesis, 'row');
});

test('classification repair corrects policy misfires for contract-heavy spreadsheet corpora', () => {
  const repaired = repairDocumentClassificationDecision(
    {
      docType: 'policy',
      initialChunkingHypothesis: 'section',
      priorityFeatures: ['pages'],
    },
    {
      parserStrategy: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalFilename: 'Label Report - Audit Rights.xlsx',
      previewText:
        'Filename | Audit Rights\nSample Agreement.pdf | Each party may audit the other party compliance with this Agreement.',
      sections: [
        { kind: 'row_block', textRef: 'Filename | Audit Rights' },
        {
          kind: 'row_block',
          textRef:
            'Sample Agreement.pdf | Each party may audit the other party compliance with this Agreement.',
        },
      ],
    }
  );

  assert.equal(repaired.docType, 'contract');
  assert.equal(repaired.initialChunkingHypothesis, 'row');
});

test('classification repair corrects policy misfires for clause-heavy contract pdfs', () => {
  const repaired = repairDocumentClassificationDecision(
    {
      docType: 'policy',
      initialChunkingHypothesis: 'section',
      priorityFeatures: ['pages'],
    },
    {
      parserStrategy: 'pdf',
      mimeType: 'application/pdf',
      originalFilename: 'PROMOTION AND DISTRIBUTION AGREEMENT.PDF',
      previewText:
        'PROMOTION AND DISTRIBUTION AGREEMENT\nEffective Date\n1. DEFINITIONS\n1.1 In this Agreement unless expressly stated otherwise...\n2.1 Products License Grant.',
      sections: [
        {
          kind: 'paragraph_block',
          textRef:
            'PROMOTION AND DISTRIBUTION AGREEMENT This Promotion and Distribution Agreement including all exhibits, effective as of the Effective Date...',
        },
        {
          kind: 'clause_block',
          textRef:
            '1.1 In this Agreement unless expressly stated otherwise: Effective Date, Distributor, and License definitions apply...',
        },
        {
          kind: 'clause_block',
          textRef:
            '2.1 Products License Grant. Subject to the terms and conditions of this Agreement, Google grants Distributor a license...',
        },
      ],
    }
  );

  assert.equal(repaired.docType, 'contract');
  assert.equal(repaired.initialChunkingHypothesis, 'clause');
});

test('chunk strategy prompt explicitly defines strategy units and structural tie-break rules', () => {
  const prompt = buildChunkStrategyPrompt({
    parserStrategy: 'pdf',
    docType: 'contract',
    initialChunkingHypothesis: 'clause',
    priorityFeatures: ['clauses'],
    previewText:
      'COLLABORATION AGREEMENT\n1.1 Affiliate means...\n1.2 Allocable Overhead means...\nSection 17.7 Arbitration',
    sectionCount: 142,
    sampledSectionCount: 142,
    sections: [
      { kind: 'heading', textRef: 'COLLABORATION AGREEMENT' },
      { kind: 'clause_block', textRef: '1.1 Affiliate means...' },
      { kind: 'clause_block', textRef: '1.2 Allocable Overhead means...' },
      { kind: 'clause_block', textRef: '17.7 Arbitration...' },
    ],
  });

  assert.match(prompt, /section\s*:\s*preserve a topical section/i);
  assert.match(prompt, /faq\s*:\s*preserve one question-?answer pair/i);
  assert.match(prompt, /clause\s*:\s*preserve one contract clause/i);
  assert.match(prompt, /row\s*:\s*preserve one table or spreadsheet row/i);
  assert.match(prompt, /docType informs but does not override observed structure/i);
  assert.match(prompt, /if clause blocks or legal provisions dominate.*choose clause/i);
  assert.match(prompt, /if row\/table blocks dominate.*choose row even when docType is contract/i);
});

test('enrichment repair clamps overlong fields back into the structured schema contract', () => {
  const repaired = repairChunkEnrichmentDecision(
    {
      title: 'T'.repeat(180),
      summary: 'S'.repeat(400),
      keywords: Array.from({ length: 12 }, (_, index) => `keyword-${index}`),
      entities: Array.from({ length: 10 }, (_, index) => `entity-${index}`),
      questionsAnswered: Array.from({ length: 9 }, (_, index) => `question-${index}`),
      versionGuess: 'V'.repeat(90),
      authorityGuess: 'medium',
      reviewHints: Array.from({ length: 9 }, (_, index) => `hint-${index}`),
    },
    {
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      tenant: 'tenant-a',
      rawTextRef: 'blob://chunk-1',
      cleanText:
        'Employees must submit leave requests through the HR system at least two weeks before the requested start date.',
      aclTags: [],
      checksum: 'checksum-1',
      reviewStatus: 'pending',
      indexStatus: 'pending',
      chunkStrategy: 'section',
      span: { paragraphStart: 1, paragraphEnd: 1 },
      metadataVersion: 1,
    }
  );

  assert.equal(repaired.title?.length, 120);
  assert.equal(repaired.summary?.length, 240);
  assert.equal(repaired.keywords?.length, 8);
  assert.equal(repaired.entities?.length, 8);
  assert.equal(repaired.questionsAnswered?.length, 6);
  assert.equal(repaired.versionGuess?.length, 60);
  assert.equal(repaired.reviewHints?.length, 6);
});

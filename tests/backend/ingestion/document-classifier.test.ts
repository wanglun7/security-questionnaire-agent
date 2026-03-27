import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyDocument } from '../../../lib/ingestion/services/document-classifier';

test('classifier requires an LLM provider', async () => {
  await assert.rejects(
    classifyDocument({
      parserStrategy: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalFilename: 'security-questionnaire.xlsx',
      previewText: '问题列\n是否支持SSO',
      sectionCount: 2,
      sampledSectionCount: 2,
      sections: [
        { kind: 'row_block', textRef: '问题列' },
        { kind: 'row_block', textRef: '是否支持SSO' },
      ],
    }),
    /LLM decision provider is required for document classification/i
  );
});

test('classifier can use structured LLM decision output when provider is supplied', async () => {
  const result = await classifyDocument(
    {
      parserStrategy: 'pdf',
      mimeType: 'application/pdf',
      originalFilename: 'msa.pdf',
      previewText: 'Master Service Agreement',
      sectionCount: 2,
      sampledSectionCount: 2,
      sections: [
        { kind: 'clause_block', textRef: '1. Confidentiality obligations' },
        { kind: 'clause_block', textRef: '2. Audit rights' },
      ],
    },
    {
      provider: {
        classifyDocument: async () => ({
          docType: 'contract',
          initialChunkingHypothesis: 'clause',
          priorityFeatures: ['clauses'],
        }),
      },
    }
  );

  assert.equal(result.docType, 'contract');
  assert.equal(result.initialChunkingHypothesis, 'clause');
});

test('classifier surfaces provider failures instead of falling back', async () => {
  await assert.rejects(
    classifyDocument(
      {
        parserStrategy: 'html',
        mimeType: 'text/html',
        originalFilename: 'faq-sample.html',
        previewText:
          'General Information\nWhat is PHP?\nPHP is an HTML-embedded scripting language.\nWhat does PHP stand for?\nPHP stands for PHP: Hypertext Preprocessor.',
        sectionCount: 3,
        sampledSectionCount: 3,
        sections: [
          { kind: 'faq_block', textRef: 'Q: What is PHP?\nA: PHP is an HTML-embedded scripting language.' },
          { kind: 'faq_block', textRef: 'Q: What does PHP stand for?\nA: PHP stands for PHP: Hypertext Preprocessor.' },
          { kind: 'heading', textRef: 'General Information' },
        ],
      },
      {
        provider: {
          classifyDocument: async () => {
            throw new Error('gateway timeout');
          },
        },
      }
    ),
    /gateway timeout/i
  );
});

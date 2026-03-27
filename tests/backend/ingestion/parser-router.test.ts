import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveParserStrategy } from '../../../lib/ingestion/services/parser-router';

test('parser router resolves spreadsheet inputs deterministically', () => {
  assert.equal(
    resolveParserStrategy({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalFilename: 'security-questionnaire.xlsx',
    }),
    'xlsx'
  );
});

test('parser router resolves docx and html inputs deterministically', () => {
  assert.equal(
    resolveParserStrategy({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalFilename: 'manual.docx',
    }),
    'docx'
  );

  assert.equal(
    resolveParserStrategy({
      mimeType: 'text/html',
      originalFilename: 'faq.html',
    }),
    'html'
  );
});

test('parser router falls back to pdf for unknown document-like inputs', () => {
  assert.equal(
    resolveParserStrategy({
      mimeType: 'application/pdf',
      originalFilename: 'contract.pdf',
    }),
    'pdf'
  );

  assert.equal(
    resolveParserStrategy({
      mimeType: 'application/octet-stream',
      originalFilename: 'mystery.bin',
    }),
    'pdf'
  );
});

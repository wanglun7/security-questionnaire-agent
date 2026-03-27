import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChunkTasks } from '../../../lib/ingestion/services/chunking';

test('chunking service creates one task per row-like section', () => {
  const tasks = buildChunkTasks({
    documentId: 'doc_1',
    chunkingStrategy: 'row',
    sections: [
      {
        sectionId: 's1',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'r1',
        span: { rowStart: 1, rowEnd: 1 },
      },
      {
        sectionId: 's2',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'r2',
        span: { rowStart: 2, rowEnd: 2 },
      },
    ],
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.chunkingStrategy, 'row');
});

test('section chunking groups heading bodies into one task per heading section', () => {
  const tasks = buildChunkTasks({
    documentId: 'doc_1',
    chunkingStrategy: 'section',
    sections: [
      {
        sectionId: 'h1',
        documentId: 'doc_1',
        kind: 'heading',
        title: 'Overview',
        level: 1,
        textRef: 'Overview',
        span: { paragraphStart: 1, paragraphEnd: 1 },
      },
      {
        sectionId: 'p1',
        documentId: 'doc_1',
        kind: 'paragraph_block',
        textRef: 'The platform supports SSO.',
        span: { paragraphStart: 2, paragraphEnd: 2 },
      },
      {
        sectionId: 'p2',
        documentId: 'doc_1',
        kind: 'paragraph_block',
        textRef: 'The platform supports MFA.',
        span: { paragraphStart: 3, paragraphEnd: 3 },
      },
      {
        sectionId: 'h2',
        documentId: 'doc_1',
        kind: 'heading',
        title: 'Audit Logging',
        level: 1,
        textRef: 'Audit Logging',
        span: { paragraphStart: 4, paragraphEnd: 4 },
      },
      {
        sectionId: 'p3',
        documentId: 'doc_1',
        kind: 'paragraph_block',
        textRef: 'Audit logs are retained for one year.',
        span: { paragraphStart: 5, paragraphEnd: 5 },
      },
    ],
  });

  assert.equal(tasks.length, 2);
  assert.match(tasks[0]?.textRef ?? '', /Overview/);
  assert.match(tasks[0]?.textRef ?? '', /supports SSO/);
  assert.match(tasks[0]?.textRef ?? '', /supports MFA/);
  assert.match(tasks[1]?.textRef ?? '', /Audit Logging/);
  assert.match(tasks[1]?.textRef ?? '', /retained for one year/);
});

test('row chunking skips header-only and empty rows', () => {
  const tasks = buildChunkTasks({
    documentId: 'doc_1',
    chunkingStrategy: 'row',
    sections: [
      {
        sectionId: 'r1',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'Question | Answer',
        span: { rowStart: 1, rowEnd: 1 },
      },
      {
        sectionId: 'r2',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'Does the platform support SSO? | Yes',
        span: { rowStart: 2, rowEnd: 2 },
      },
      {
        sectionId: 'r3',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: ' | ',
        span: { rowStart: 3, rowEnd: 3 },
      },
    ],
  });

  assert.equal(tasks.length, 1);
  assert.match(tasks[0]?.textRef ?? '', /support SSO/i);
});

test('row chunking skips first-row column headers from real spreadsheet-like data', () => {
  const tasks = buildChunkTasks({
    documentId: 'doc_1',
    chunkingStrategy: 'row',
    sections: [
      {
        sectionId: 'r1',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: 'ID | Months | ListMonths',
        span: { sheetName: 'Sheet1', rowStart: 1, rowEnd: 1 },
      },
      {
        sectionId: 'r2',
        documentId: 'doc_1',
        kind: 'row_block',
        textRef: '1 | January | January | Select Month',
        span: { sheetName: 'Sheet1', rowStart: 2, rowEnd: 2 },
      },
    ],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.textRef, '1 | January | January | Select Month');
});

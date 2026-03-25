import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVectorSearchRows } from '../../lib/rag/result-shape';

test('normalizeVectorSearchRows accepts drizzle Result arrays', () => {
  const rows = normalizeVectorSearchRows([
    {
      id: 'kb-1',
      question: '数据存储在哪里？',
      answer: '数据存储在中国境内的自建 IDC 机房。',
      category: 'compliance',
      document_source: '数据中心说明',
      similarity: '0.91',
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'kb-1');
});

test('normalizeVectorSearchRows accepts driver objects with rows', () => {
  const rows = normalizeVectorSearchRows({
    rows: [
      {
        id: 'kb-2',
        question: '是否支持 API 接口？',
        answer: '提供 RESTful API。',
        category: 'product',
        document_source: 'API 文档',
        similarity: '0.88',
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'kb-2');
});

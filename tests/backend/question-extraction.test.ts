import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPreviewRows,
  extractQuestionsFromRows,
  isNonQuestion,
} from '../../lib/questionnaire/extraction';

test('buildPreviewRows limits preview to the first 20 rows', () => {
  const rows = Array.from({ length: 25 }, (_, index) => [`Row ${index + 1}`]);

  const preview = buildPreviewRows(rows);

  assert.equal(preview.length, 20);
  assert.deepEqual(preview[0], ['Row 1']);
  assert.deepEqual(preview[19], ['Row 20']);
});

test('isNonQuestion filters numbering, titles, and short yes-no values', () => {
  assert.equal(isNonQuestion('1.2.3'), true);
  assert.equal(isNonQuestion('第一章 安全要求'), true);
  assert.equal(isNonQuestion('Yes'), true);
  assert.equal(isNonQuestion('是否支持 SSO 单点登录？'), false);
});

test('extractQuestionsFromRows parses the selected column and keeps source row numbers', () => {
  const rows = [
    ['编号', '说明', '问题'],
    ['1', '忽略', '是否支持 SSO 单点登录？'],
    ['2', '忽略', 'Yes'],
    ['3', '忽略', '数据是否加密存储？'],
    ['4', '忽略', '第1章 基础信息'],
    ['5', '忽略', '是否支持 API 接口？'],
  ];

  const questions = extractQuestionsFromRows({
    rows,
    sheetName: 'Sheet1',
    columnIndex: 2,
  });

  assert.deepEqual(
    questions.map((question) => ({
      text: question.text,
      orderNum: question.orderNum,
      sourceSheetName: question.sourceSheetName,
      sourceRowNum: question.sourceRowNum,
    })),
    [
      {
        text: '是否支持 SSO 单点登录？',
        orderNum: 1,
        sourceSheetName: 'Sheet1',
        sourceRowNum: 2,
      },
      {
        text: '数据是否加密存储？',
        orderNum: 2,
        sourceSheetName: 'Sheet1',
        sourceRowNum: 4,
      },
      {
        text: '是否支持 API 接口？',
        orderNum: 3,
        sourceSheetName: 'Sheet1',
        sourceRowNum: 6,
      },
    ]
  );
});

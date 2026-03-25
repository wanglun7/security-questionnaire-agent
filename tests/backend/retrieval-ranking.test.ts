import test from 'node:test';
import assert from 'node:assert/strict';

import { extractKeywords, rerankKnowledgeResults } from '../../lib/rag/ranking';

test('extractKeywords keeps domain keywords present in the question text', () => {
  const keywords = extractKeywords('是否支持 SSO 和 MFA，以及操作日志保留多久？');

  assert.deepEqual(keywords, ['SSO', 'MFA', '日志']);
});

test('rerankKnowledgeResults prefers keyword and category matches, then returns top 3', () => {
  const ranked = rerankKnowledgeResults({
    questionText: '是否支持 SSO 单点登录？',
    results: [
      { id: 'a', question: '日志保留多久？', answer: '日志保留 180 天。', category: 'security', documentSource: '日志规范', similarity: 0.92 },
      { id: 'b', question: '是否支持 SSO 单点登录？', answer: '支持 SAML 2.0 和 OIDC。', category: 'identity-SSO', documentSource: '安全白皮书', similarity: 0.88 },
      { id: 'c', question: '是否支持 MFA？', answer: '支持短信和 TOTP。', category: 'identity', documentSource: '身份认证说明', similarity: 0.87 },
      { id: 'd', question: '是否支持 API 接口？', answer: '提供 RESTful API。', category: 'product', documentSource: 'API 文档', similarity: 0.86 },
      { id: 'e', question: '是否支持信创环境部署？', answer: '支持麒麟和达梦。', category: 'compliance', documentSource: '信创适配说明', similarity: 0.85 },
    ],
  });

  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].id, 'b');
  assert.deepEqual(
    ranked.map((item) => item.id),
    ['b', 'a', 'c']
  );
  assert.ok(ranked[0].finalScore > ranked[1].finalScore);
});

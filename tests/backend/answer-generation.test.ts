import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnswerPrompt, detectNeedsReview } from '../../lib/rag/prompt';

test('buildAnswerPrompt enforces citations and manual review fallback', () => {
  const prompt = buildAnswerPrompt({
    question: '是否支持 SSO 单点登录？',
    candidates: [
      {
        id: '1',
        question: '是否支持 SSO 单点登录？',
        answer: '支持基于 SAML 2.0 和 OIDC 的单点登录。',
        category: 'identity-SSO',
        documentSource: '产品安全白皮书 v3.2',
        similarity: 0.97,
      },
    ],
  });

  assert.match(prompt, /答案必须基于参考答案/);
  assert.match(prompt, /在答案中标注引用编号 \[1\] \[2\]/);
  assert.match(prompt, /如果参考答案不足，直接说"需要人工确认"/);
  assert.match(prompt, /\[1\] 支持基于 SAML 2\.0 和 OIDC 的单点登录。/);
});

test('detectNeedsReview marks sparse or explicit fallback answers for review', () => {
  assert.equal(detectNeedsReview({ answerText: '这个问题需要人工确认。', candidateCount: 3 }), true);
  assert.equal(detectNeedsReview({ answerText: '支持基于 SAML 2.0 的单点登录 [1]。', candidateCount: 0 }), true);
  assert.equal(detectNeedsReview({ answerText: '支持基于 SAML 2.0 的单点登录 [1]。', candidateCount: 2 }), false);
});

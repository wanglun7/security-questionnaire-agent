import type { RankedKnowledgeResult } from './ranking';

export function buildAnswerPrompt({
  question,
  candidates,
}: {
  question: string;
  candidates: RankedKnowledgeResult[];
}): string {
  const references = candidates
    .map(
      (candidate, index) =>
        `[${index + 1}] ${candidate.answer}\n来源：${candidate.documentSource}`
    )
    .join('\n\n');

  return `你是云图科技的安全问卷回答助手。基于提供的参考答案，回答用户问题。

问题：${question}

参考答案：
${references}

要求：
1. 答案必须基于参考答案，不要编造
2. 在答案中标注引用编号 [1] [2]
3. 如果参考答案不足，直接说"需要人工确认"
4. 保持专业、简洁

回答：`;
}

export function detectNeedsReview({
  answerText,
  candidateCount,
}: {
  answerText: string;
  candidateCount: number;
}): boolean {
  return candidateCount === 0 ||
    answerText.includes('需要人工确认') ||
    answerText.includes('需人工确认');
}

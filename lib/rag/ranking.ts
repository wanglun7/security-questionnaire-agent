const DOMAIN_KEYWORDS = ['SSO', '等保', '加密', 'MFA', '备份', '信创', 'API', '日志', '渗透', '数据'] as const;

export interface RankedKnowledgeResult {
  id: string;
  question: string;
  answer: string;
  category: string;
  documentSource: string;
  similarity: number;
}

export interface RerankedKnowledgeResult extends RankedKnowledgeResult {
  finalScore: number;
}

export function extractKeywords(text: string): string[] {
  return DOMAIN_KEYWORDS.filter((keyword) => text.includes(keyword));
}

export function rerankKnowledgeResults({
  questionText,
  results,
}: {
  questionText: string;
  results: RankedKnowledgeResult[];
}): RerankedKnowledgeResult[] {
  const keywords = extractKeywords(questionText);

  return results
    .map((result) => {
      let finalScore = result.similarity;

      if (keywords.some((keyword) => result.category.toUpperCase().includes(keyword.toUpperCase()))) {
        finalScore += 0.1;
      }

      const hitCount = keywords.filter(
        (keyword) => result.question.includes(keyword) || result.answer.includes(keyword)
      ).length;

      finalScore += hitCount * 0.05;

      return {
        ...result,
        finalScore,
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, 3);
}

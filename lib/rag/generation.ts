import { generateText } from 'ai';
import { openai } from '../ai/client';
import { retrieveKnowledge, RetrievalResult } from './retrieval';
import { buildAnswerPrompt, detectNeedsReview } from './prompt';

export interface GeneratedAnswer {
  content: string;
  needsReview: boolean;
  sources: RetrievalResult[];
}

export async function generateAnswer(question: string): Promise<GeneratedAnswer> {
  const sources = await retrieveKnowledge(question, 5);

  if (sources.length === 0) {
    return {
      content: '需要人工确认。',
      needsReview: true,
      sources,
    };
  }

  const prompt = buildAnswerPrompt({
    question,
    candidates: sources,
  });

  const { text } = await generateText({
    model: openai(process.env.OPENAI_COMPLETION_MODEL || 'gpt-5.2'),
    prompt,
  });

  return {
    content: text,
    needsReview: detectNeedsReview({
      answerText: text,
      candidateCount: sources.length,
    }),
    sources,
  };
}

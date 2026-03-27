import { createOpenAI } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

export function normalizeOpenAIBaseUrl(url?: string) {
  if (!url) {
    return undefined;
  }

  const normalized = url.replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

export const openai = createOpenAI({
  baseURL: normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL),
  apiKey: process.env.OPENAI_API_KEY,
});

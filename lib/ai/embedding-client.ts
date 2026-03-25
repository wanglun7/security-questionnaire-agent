import { createOpenAI } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

export const embeddingClient = createOpenAI({
  baseURL: process.env.EMBEDDING_BASE_URL,
  apiKey: process.env.EMBEDDING_API_KEY,
});

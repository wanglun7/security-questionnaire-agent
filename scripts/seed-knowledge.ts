import * as dotenv from 'dotenv';
import { db } from '../lib/db/client';
import { knowledgeBase } from '../lib/db/schema';
import { seedKnowledge } from '../lib/seed-data';
import { generateEmbedding } from '../lib/ai/embeddings';

dotenv.config({ path: '.env.local', quiet: true });

console.log('Environment check:');
console.log('EMBEDDING_API_KEY:', process.env.EMBEDDING_API_KEY ? '✓ loaded' : '✗ missing');
console.log('EMBEDDING_BASE_URL:', process.env.EMBEDDING_BASE_URL || '✗ missing');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ loaded' : '✗ missing');

async function seed() {
  console.log('开始 seed 知识库...');
  await db.delete(knowledgeBase);

  for (const entry of seedKnowledge) {
    console.log(`处理: ${entry.question}`);
    const embedding = await generateEmbedding(entry.question + ' ' + entry.answer);

    await db.insert(knowledgeBase).values({
      ...entry,
      embedding
    });
  }

  console.log(`✅ 完成！已插入 ${seedKnowledge.length} 条数据`);
  process.exit(0);
}

seed().catch(console.error);

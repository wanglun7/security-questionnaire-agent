import * as dotenv from 'dotenv';
import { db } from '../lib/db/client';
import { knowledgeBase } from '../lib/db/schema';
import { generateEmbedding } from '../lib/ai/embeddings';
import { sql } from 'drizzle-orm';
import { generateText } from 'ai';
import { openai } from '../lib/ai/client';

dotenv.config({ path: '.env.local' });

async function testPipeline() {
  const testQuestion = '你们的数据安全措施有哪些？';

  console.log('🔍 测试问题:', testQuestion);
  console.log('\n1️⃣ 生成问题 embedding...');
  const questionEmbedding = await generateEmbedding(testQuestion);
  console.log('✓ Embedding 维度:', questionEmbedding.length);

  console.log('\n2️⃣ 向量检索 Top 3...');
  const results = await db.execute(sql`
    SELECT id, question, answer, category, document_source,
           1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector) as similarity
    FROM knowledge_base
    ORDER BY embedding <=> ${JSON.stringify(questionEmbedding)}::vector
    LIMIT 3
  `);

  console.log('✓ 检索结果:');
  const rows = results as any[];
  rows.forEach((row: any, i: number) => {
    console.log(`  ${i + 1}. [${row.similarity.toFixed(3)}] ${row.question}`);
  });

  console.log('\n3️⃣ LLM 生成答案...');
  const context = rows.map((row: any) =>
    `Q: ${row.question}\nA: ${row.answer}\n来源: ${row.document_source}`
  ).join('\n\n');

  const { text } = await generateText({
    model: openai('gpt-5.4'),
    prompt: `你是云图科技的售前顾问。基于以下知识库内容回答用户问题。

知识库:
${context}

用户问题: ${testQuestion}

要求: 基于知识库内容回答，如果知识库中没有相关信息，说明需要人工确认。`,
  });

  console.log('✓ 生成答案:\n', text);
  console.log('\n✅ AI 闭环验证完成！');
  process.exit(0);
}

testPipeline().catch(console.error);
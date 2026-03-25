import * as dotenv from 'dotenv';
import { processProjectQuestions } from '../lib/projects/service';

dotenv.config({ path: '.env.local', quiet: true });

async function generateAnswers(projectId: string) {
  console.log(`🤖 开始为项目 ${projectId} 生成答案...\n`);
  const result = await processProjectQuestions(projectId);
  console.log('✅ 全部完成！');
  console.log(result);
  process.exit(0);
}

const projectId = process.argv[2];
if (!projectId) {
  console.error('用法: npx tsx scripts/generate-answers.ts <project-id>');
  process.exit(1);
}
generateAnswers(projectId).catch(console.error);

import * as dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { createProjectUpload, parseProjectFile } from '../lib/projects/service';

dotenv.config({ path: '.env.local', quiet: true });

async function importQuestionnaire(filePath: string, projectName: string) {
  console.log(`📂 上传并创建项目: ${filePath}`);
  const fileBuffer = await readFile(filePath);
  const file = new File([fileBuffer], basename(filePath), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const project = await createProjectUpload({
    file,
    projectName,
  });
  console.log(`✓ 项目 ID: ${project.id}`);

  const parsed = await parseProjectFile({
    projectId: project.id,
    sheetIndex: 0,
    columnIndex: 0,
  });

  console.log(`✅ 完成！已导入 ${parsed.questionCount} 个问题`);
  process.exit(0);
}

const filePath = process.argv[2] || 'test-questionnaire.xlsx';
const projectName = process.argv[3] || '测试问卷项目';
importQuestionnaire(filePath, projectName).catch(console.error);

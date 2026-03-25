import * as dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import {
  createProjectUpload,
  getProjectDetail,
  parseProjectFile,
  previewProjectFile,
  processProjectQuestions,
} from '../lib/projects/service';

dotenv.config({ path: '.env.local', quiet: true });

async function run() {
  const inputPath = process.argv[2] || 'test-questionnaire.xlsx';
  const projectName = process.argv[3] || '后端链路验收';
  const fileBuffer = await readFile(inputPath);
  const file = new File([fileBuffer], basename(inputPath), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const project = await createProjectUpload({
    file,
    projectName,
  });

  console.log(`PROJECT ${project.id} status=${project.status}`);

  const preview = await previewProjectFile(project.id);
  console.log('PREVIEW_ROWS', JSON.stringify(preview.preview.slice(0, 5), null, 2));

  const parsed = await parseProjectFile({
    projectId: project.id,
    sheetIndex: 0,
    columnIndex: 0,
  });
  console.log('PARSE_RESULT', parsed);

  const processed = await processProjectQuestions(project.id);
  console.log('PROCESS_RESULT', processed);

  const detail = await getProjectDetail(project.id);
  console.log(`DETAIL status=${detail.status} questions=${detail.questions.length}`);

  detail.questions.slice(0, 5).forEach((question) => {
    console.log(`\nQ${question.orderNum}: ${question.text}`);
    if (!question.answer) {
      console.log('A: <missing>');
      return;
    }

    console.log(`A: ${question.answer.editedContent || question.answer.content}`);
    console.log(`needsReview: ${String(question.answer.needsReview)}`);
    question.answer.sources.forEach((source) => {
      console.log(`  [${source.rank}] ${source.sourceText}`);
    });
  });

  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { answerSources, answers, projects, questions } from '../db/schema';
import { parseExcel, previewExcel } from '../excel/parser';
import { generateAnswer } from '../rag/generation';

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export interface ProjectDetailSource {
  id: string;
  kbEntryId: string | null;
  sourceText: string | null;
  rank: number;
}

export interface ProjectDetailAnswer {
  id: string;
  content: string;
  editedContent: string | null;
  needsReview: boolean | null;
  sources: ProjectDetailSource[];
}

export interface ProjectDetailQuestion {
  id: string;
  text: string;
  orderNum: number;
  sourceSheetName: string | null;
  sourceRowNum: number | null;
  answer: ProjectDetailAnswer | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  originalFileName: string;
  status: string;
  errorMessage: string | null;
  questions: ProjectDetailQuestion[];
}

function assertExcelUpload(file: File) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Only .xlsx files are supported');
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error('File too large');
  }
}

async function getProjectById(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  return project;
}

async function clearAnswersForQuestionIds(questionIds: string[]) {
  if (questionIds.length === 0) {
    return;
  }

  const existingAnswers = await db
    .select({ id: answers.id })
    .from(answers)
    .where(inArray(answers.questionId, questionIds));

  const answerIds = existingAnswers.map((answer) => answer.id);

  if (answerIds.length > 0) {
    await db.delete(answerSources).where(inArray(answerSources.answerId, answerIds));
  }

  await db.delete(answers).where(inArray(answers.questionId, questionIds));
}

async function clearProjectQuestions(projectId: string) {
  const existingQuestions = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.projectId, projectId));

  const questionIds = existingQuestions.map((question) => question.id);
  await clearAnswersForQuestionIds(questionIds);

  if (questionIds.length > 0) {
    await db.delete(questions).where(inArray(questions.id, questionIds));
  }
}

export async function createProjectUpload({
  file,
  projectName,
}: {
  file: File;
  projectName?: string | null;
}) {
  assertExcelUpload(file);

  const uploadsDir = join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  const fileId = randomUUID();
  const filePath = join(uploadsDir, `${fileId}.xlsx`);
  const bytes = await file.arrayBuffer();

  await writeFile(filePath, Buffer.from(bytes));

  const [project] = await db
    .insert(projects)
    .values({
      name: projectName?.trim() || file.name.replace(/\.xlsx$/i, ''),
      originalFileName: file.name,
      filePath,
      status: 'uploaded',
      errorMessage: null,
    })
    .returning();

  return project;
}

export async function previewProjectFile(projectId: string) {
  const project = await getProjectById(projectId);
  return previewExcel(project.filePath);
}

export async function parseProjectFile({
  projectId,
  sheetIndex,
  columnIndex,
}: {
  projectId: string;
  sheetIndex: number;
  columnIndex: number;
}) {
  const project = await getProjectById(projectId);

  await db
    .update(projects)
    .set({
      status: 'parsing',
      errorMessage: null,
    })
    .where(eq(projects.id, projectId));

  try {
    await clearProjectQuestions(projectId);

    const parsedQuestions = parseExcel(project.filePath, {
      sheetIndex,
      columnIndex,
    });

    if (parsedQuestions.length > 0) {
      await db.insert(questions).values(
        parsedQuestions.map((question) => ({
          projectId,
          text: question.text,
          orderNum: question.orderNum,
          sourceSheetName: question.sourceSheetName,
          sourceRowNum: question.sourceRowNum,
        }))
      );
    }

    await db
      .update(projects)
      .set({
        status: 'parsed',
        errorMessage: null,
      })
      .where(eq(projects.id, projectId));

    return {
      questionCount: parsedQuestions.length,
      status: 'parsed',
    };
  } catch (error) {
    await db
      .update(projects)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Parse failed',
      })
      .where(eq(projects.id, projectId));

    throw error;
  }
}

export async function listProjectQuestions(projectId: string) {
  await getProjectById(projectId);

  return db
    .select({
      id: questions.id,
      text: questions.text,
      orderNum: questions.orderNum,
      sourceSheetName: questions.sourceSheetName,
      sourceRowNum: questions.sourceRowNum,
    })
    .from(questions)
    .where(eq(questions.projectId, projectId))
    .orderBy(questions.orderNum);
}

export async function processProjectQuestions(projectId: string) {
  await getProjectById(projectId);

  await db
    .update(projects)
    .set({
      status: 'processing',
      errorMessage: null,
    })
    .where(eq(projects.id, projectId));

  const projectQuestions = await db
    .select({
      id: questions.id,
      text: questions.text,
      orderNum: questions.orderNum,
    })
    .from(questions)
    .where(eq(questions.projectId, projectId))
    .orderBy(questions.orderNum);

  const questionIds = projectQuestions.map((question) => question.id);
  await clearAnswersForQuestionIds(questionIds);

  let successCount = 0;
  let failCount = 0;

  for (let index = 0; index < projectQuestions.length; index += 3) {
    const batch = projectQuestions.slice(index, index + 3);

    const results = await Promise.allSettled(
      batch.map(async (question) => {
        const generated = await generateAnswer(question.text);

        const [answer] = await db
          .insert(answers)
          .values({
            questionId: question.id,
            content: generated.content,
            needsReview: generated.needsReview,
          })
          .returning();

        if (generated.sources.length > 0) {
          await db.insert(answerSources).values(
            generated.sources.map((source, sourceIndex) => ({
              answerId: answer.id,
              kbEntryId: source.id,
              sourceText: source.answer,
              rank: sourceIndex + 1,
            }))
          );
        }
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successCount += 1;
        return;
      }

      failCount += 1;
      console.error('Failed to process question batch item:', result.reason);
    });
  }

  const status = failCount === 0 ? 'ready' : successCount > 0 ? 'ready' : 'failed';
  const errorMessage = failCount > 0 ? `${failCount} questions failed` : null;

  await db
    .update(projects)
    .set({
      status,
      errorMessage,
    })
    .where(eq(projects.id, projectId));

  return {
    success: true,
    successCount,
    failCount,
    status,
  };
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  const project = await getProjectById(projectId);
  const projectQuestions = await listProjectQuestions(projectId);
  const questionIds = projectQuestions.map((question) => question.id);

  const projectAnswers = questionIds.length === 0
    ? []
    : await db
        .select({
          id: answers.id,
          questionId: answers.questionId,
          content: answers.content,
          editedContent: answers.editedContent,
          needsReview: answers.needsReview,
        })
        .from(answers)
        .where(inArray(answers.questionId, questionIds))
        .orderBy(desc(answers.createdAt));

  const answerByQuestionId = new Map<string, typeof projectAnswers[number]>();

  projectAnswers.forEach((answer) => {
    if (answer.questionId && !answerByQuestionId.has(answer.questionId)) {
      answerByQuestionId.set(answer.questionId, answer);
    }
  });

  const answerIds = Array.from(answerByQuestionId.values()).map((answer) => answer.id);
  const projectSources = answerIds.length === 0
    ? []
    : await db
        .select({
          id: answerSources.id,
          answerId: answerSources.answerId,
          kbEntryId: answerSources.kbEntryId,
          sourceText: answerSources.sourceText,
          rank: answerSources.rank,
        })
        .from(answerSources)
        .where(inArray(answerSources.answerId, answerIds))
        .orderBy(answerSources.rank);

  const sourcesByAnswerId = new Map<string, ProjectDetailSource[]>();

  projectSources.forEach((source) => {
    if (!source.answerId) {
      return;
    }

    const list = sourcesByAnswerId.get(source.answerId) ?? [];
    list.push({
      id: source.id,
      kbEntryId: source.kbEntryId,
      sourceText: source.sourceText,
      rank: source.rank,
    });
    sourcesByAnswerId.set(source.answerId, list);
  });

  return {
    id: project.id,
    name: project.name,
    originalFileName: project.originalFileName,
    status: project.status,
    errorMessage: project.errorMessage,
    questions: projectQuestions.map((question) => {
      const answer = answerByQuestionId.get(question.id);

      return {
        ...question,
        answer: answer
          ? {
              id: answer.id,
              content: answer.content,
              editedContent: answer.editedContent,
              needsReview: answer.needsReview,
              sources: sourcesByAnswerId.get(answer.id) ?? [],
            }
          : null,
      };
    }),
  };
}

export async function updateAnswerContent({
  answerId,
  editedContent,
}: {
  answerId: string;
  editedContent: string;
}) {
  await db
    .update(answers)
    .set({
      editedContent,
    })
    .where(eq(answers.id, answerId));
}

export async function autoParseUploadedProject(projectId: string) {
  return parseProjectFile({
    projectId,
    sheetIndex: 0,
    columnIndex: 0,
  });
}

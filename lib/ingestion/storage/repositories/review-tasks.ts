import { eq } from 'drizzle-orm';

import { db } from '../../../db/client';
import { reviewTasks } from '../../../db/schema';
import type { ReviewTaskContract } from '../../contracts/review';
import type { ReviewTaskResolutionRecord } from '../types';

function toReviewTaskRow(
  ingestionRunId: string,
  documentId: string,
  task: ReviewTaskContract
) {
  return {
    id: task.reviewTaskId,
    ingestionRunId,
    documentId: task.targetDocumentId ?? documentId,
    taskType: task.taskType,
    reasonCodesJson: task.reasonCodes,
    targetChunkIdsJson: task.targetChunkIds ?? [],
    targetDocumentId: task.targetDocumentId,
    assignee: task.assignee,
    owner: task.owner,
    scope: task.scope ?? (task.taskType === 'document_review' ? 'document' : 'chunk'),
    scopeRefId: task.scopeRefId ?? task.targetChunkIds?.[0] ?? task.targetDocumentId,
    reasonCode: task.reasonCode ?? task.reasonCodes[0] ?? 'UNKNOWN_REASON',
    summary: task.summary,
    status: task.status ?? 'pending',
    resolutionType: task.resolutionType,
    resolutionJson: task.resolutionJson,
    resolvedAt: task.resolvedAt ? new Date(task.resolvedAt) : undefined,
  };
}

export async function replaceReviewTasks(
  ingestionRunId: string,
  documentId: string,
  tasks: ReviewTaskContract[]
) {
  await db.delete(reviewTasks).where(eq(reviewTasks.ingestionRunId, ingestionRunId));

  if (tasks.length === 0) {
    return;
  }

  await db.insert(reviewTasks).values(
    tasks.map((task) => toReviewTaskRow(ingestionRunId, documentId, task))
  );
}

export async function upsertReviewTasks(
  ingestionRunId: string,
  documentId: string,
  tasks: ReviewTaskContract[]
) {
  for (const task of tasks) {
    await db
      .insert(reviewTasks)
      .values(toReviewTaskRow(ingestionRunId, documentId, task))
      .onConflictDoUpdate({
        target: reviewTasks.id,
        set: {
          taskType: task.taskType,
          reasonCodesJson: task.reasonCodes,
          targetChunkIdsJson: task.targetChunkIds ?? [],
          targetDocumentId: task.targetDocumentId,
          assignee: task.assignee,
          owner: task.owner,
          scope: task.scope ?? (task.taskType === 'document_review' ? 'document' : 'chunk'),
          scopeRefId: task.scopeRefId ?? task.targetChunkIds?.[0] ?? task.targetDocumentId,
          reasonCode: task.reasonCode ?? task.reasonCodes[0] ?? 'UNKNOWN_REASON',
          summary: task.summary,
          status: task.status ?? 'pending',
          resolutionType: task.resolutionType,
          resolutionJson: task.resolutionJson,
          resolvedAt: task.resolvedAt ? new Date(task.resolvedAt) : undefined,
        },
      });
  }
}

export async function resolveReviewTasks(records: ReviewTaskResolutionRecord[]) {
  for (const record of records) {
    await db
      .update(reviewTasks)
      .set({
        status: record.status,
        resolutionType: record.resolutionType,
        resolutionJson: record.resolutionJson,
        resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : new Date(),
      })
      .where(eq(reviewTasks.id, record.reviewTaskId));
  }
}

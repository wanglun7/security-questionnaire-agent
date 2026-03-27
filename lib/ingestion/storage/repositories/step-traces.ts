import { db } from '../../../db/client';
import { ingestionStepTraces } from '../../../db/schema';
import type { StepTraceContract } from '../../contracts/trace';

export async function insertStepTrace(trace: StepTraceContract) {
  await db.insert(ingestionStepTraces).values({
    id: trace.traceId,
    ingestionRunId: trace.ingestionId,
    nodeName: trace.nodeName,
    status: trace.status,
    inputSummaryJson: trace.inputSummary,
    outputSummaryJson: trace.outputSummary,
    startedAt: new Date(trace.startedAt),
    finishedAt: trace.finishedAt ? new Date(trace.finishedAt) : null,
  });
}

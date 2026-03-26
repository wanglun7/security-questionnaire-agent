export type StepTraceContract = {
  traceId: string;
  ingestionId: string;
  nodeName: string;
  status: 'started' | 'completed' | 'failed' | 'interrupted';
  startedAt: string;
  finishedAt?: string;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};

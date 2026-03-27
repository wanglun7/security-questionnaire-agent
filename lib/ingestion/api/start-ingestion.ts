import { randomUUID } from 'node:crypto';

import { createIngestionGraph } from '../graph/builder';
import { createGptStructuredDecisionProvider } from '../services/llm-decision-provider';

const INGESTION_GRAPH_RECURSION_LIMIT = 4096;

type StartIngestionInput = {
  documentId: string;
  sourceUri: string;
  mimeType: string;
  originalFilename: string;
};

export async function startIngestion(
  input: StartIngestionInput,
  options?: {
    graph?: Awaited<ReturnType<typeof createIngestionGraph>>;
    idFactory?: () => string;
  }
) {
  const ingestionId = options?.idFactory?.() ?? randomUUID();
  const graph =
    options?.graph ??
    (await createIngestionGraph({
      decisionProvider: createGptStructuredDecisionProvider(),
    }));

  const result = await graph.invoke(
    {
      ingestionId,
      ...input,
      status: 'RECEIVED',
    },
    {
      configurable: {
        thread_id: ingestionId,
      },
      recursionLimit: INGESTION_GRAPH_RECURSION_LIMIT,
    }
  );

  return {
    ingestionId,
    status: result.status,
  };
}

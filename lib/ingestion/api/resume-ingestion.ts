import { Command } from '@langchain/langgraph';

import { createIngestionGraph } from '../graph/builder';
import { createGptStructuredDecisionProvider } from '../services/llm-decision-provider';

const INGESTION_GRAPH_RECURSION_LIMIT = 4096;

export async function resumeIngestion(
  ingestionId: string,
  decision: Record<string, unknown>,
  options?: {
    graph?: Awaited<ReturnType<typeof createIngestionGraph>>;
  }
) {
  const graph =
    options?.graph ??
    (await createIngestionGraph({
      decisionProvider: createGptStructuredDecisionProvider(),
    }));

  const result = await graph.invoke(
    new Command({
      resume: decision,
    }),
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

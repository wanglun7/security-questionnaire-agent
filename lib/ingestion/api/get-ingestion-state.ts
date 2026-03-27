import { createIngestionGraph } from '../graph/builder';
import { createGptStructuredDecisionProvider } from '../services/llm-decision-provider';

export async function getIngestionState(
  ingestionId: string,
  options?: {
    graph?: Awaited<ReturnType<typeof createIngestionGraph>>;
  }
) {
  const graph =
    options?.graph ??
    (await createIngestionGraph({
      decisionProvider: createGptStructuredDecisionProvider(),
    }));
  const snapshot = await graph.getState({
    configurable: {
      thread_id: ingestionId,
    },
  });

  return {
    ingestionId,
    values: snapshot.values,
    next: snapshot.next,
  };
}

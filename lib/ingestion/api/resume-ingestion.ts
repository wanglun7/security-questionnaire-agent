import { Command } from '@langchain/langgraph';

import { createIngestionGraph } from '../graph/builder';

export async function resumeIngestion(
  ingestionId: string,
  decision: Record<string, unknown>,
  options?: {
    graph?: Awaited<ReturnType<typeof createIngestionGraph>>;
  }
) {
  const graph = options?.graph ?? (await createIngestionGraph());

  const result = await graph.invoke(
    new Command({
      resume: decision,
    }),
    {
      configurable: {
        thread_id: ingestionId,
      },
    }
  );

  return {
    ingestionId,
    status: result.status,
  };
}

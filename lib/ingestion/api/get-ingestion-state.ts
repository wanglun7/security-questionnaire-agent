import { createIngestionGraph } from '../graph/builder';

export async function getIngestionState(
  ingestionId: string,
  options?: {
    graph?: Awaited<ReturnType<typeof createIngestionGraph>>;
  }
) {
  const graph = options?.graph ?? (await createIngestionGraph());
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

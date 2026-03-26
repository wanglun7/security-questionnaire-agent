import { randomUUID } from 'node:crypto';

import { createIngestionGraph } from '../graph/builder';

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
  const graph = options?.graph ?? (await createIngestionGraph());

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
    }
  );

  return {
    ingestionId,
    status: result.status,
  };
}

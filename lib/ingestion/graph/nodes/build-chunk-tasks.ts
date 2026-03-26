import { buildChunkTasks } from '../../services/chunking';

import type { IngestionState } from '../state';

export async function buildChunkTasksNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const chunkTasks = buildChunkTasks({
    documentId: state.documentId,
    chunkingStrategy: state.chunkingStrategy ?? 'section',
    sections: state.sections ?? [],
  });

  return { chunkTasks };
}

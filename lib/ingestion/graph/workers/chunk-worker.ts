import type { ChunkContract, ChunkTaskContract } from '../../contracts/chunk';

export async function runChunkWorker(task: ChunkTaskContract): Promise<ChunkContract> {
  return {
    chunkId: `${task.taskId}-chunk`,
    documentId: task.documentId,
    sectionId: task.sectionId,
    rawTextRef: task.textRef,
    cleanText: task.textRef,
    reviewStatus: 'pending',
    chunkStrategy: task.chunkingStrategy,
    span: task.span,
    metadataVersion: 1,
  };
}

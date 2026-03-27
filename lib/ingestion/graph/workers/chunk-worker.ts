import { randomUUID } from 'node:crypto';
import type { ChunkContract, ChunkTaskContract } from '../../contracts/chunk';
import { computeChunkChecksum } from '../../services/diffing';

export async function runChunkWorker(task: ChunkTaskContract): Promise<ChunkContract> {
  return {
    chunkId: randomUUID(),
    documentId: task.documentId,
    sectionId: task.sectionId,
    tenant: 'default',
    rawTextRef: task.textRef,
    cleanText: task.textRef,
    aclTags: [],
    checksum: computeChunkChecksum({ cleanText: task.textRef }),
    reviewStatus: 'pending',
    indexStatus: 'pending',
    chunkStrategy: task.chunkingStrategy,
    span: task.span,
    metadataVersion: 1,
  };
}

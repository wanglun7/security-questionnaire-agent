import { buildIndexableChunks } from '../../services/indexing';
import { generateEmbedding } from '../../../ai/embeddings';
import { ingestionStorage } from '../../storage/repositories';
import type { IngestionStorage } from '../../storage/types';

import type { IngestionState } from '../state';

function buildEmbeddingText(cleanText: string, summary?: string) {
  return summary ? `${cleanText}\n\n${summary}` : cleanText;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex] as T, currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, values.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function createWriteVectorIndexNode({
  generateEmbeddingFn = generateEmbedding,
  storage = ingestionStorage,
  embeddingConcurrency = Number(process.env.INGESTION_EMBEDDING_CONCURRENCY || 3),
}: {
  generateEmbeddingFn?: (text: string) => Promise<number[]>;
  storage?: IngestionStorage;
  embeddingConcurrency?: number;
} = {}) {
  return async function writeVectorIndexNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    if (state.status === 'REJECTED') {
      return {
        metrics: {
          ...state.metrics,
          totalChunks: 0,
        },
      };
    }

    const indexableChunks = await buildIndexableChunks(state.chunks ?? []);
    const isRowBatchMode =
      state.parserStrategy === 'xlsx' &&
      state.chunkingStrategy === 'row' &&
      state.executionMode !== 'strategy_check' &&
      Boolean(state.rowBatchProgress);
    const nextChunks = (state.chunks ?? []).map((chunk) => {
      if (chunk.reviewStatus === 'rejected') {
        return {
          ...chunk,
          indexStatus: 'rejected' as const,
        };
      }

      if (indexableChunks.some((candidate) => candidate.chunkId === chunk.chunkId)) {
        return {
          ...chunk,
          indexStatus: 'indexed' as const,
        };
      }

      return chunk;
    });
    const embeddings = await mapWithConcurrency(
      indexableChunks,
      embeddingConcurrency,
      async (chunk) => ({
        chunkId: chunk.chunkId,
        embedding: await generateEmbeddingFn(buildEmbeddingText(chunk.cleanText, chunk.summary)),
      })
    );

    if (embeddings.length > 0) {
      await storage.saveChunkEmbeddings(embeddings);
    }

    await storage.publishIndexedChunks?.({
      documentId: state.documentId,
      chunks: nextChunks,
    });

    const approvedChunkCount = nextChunks.filter((chunk) => chunk.reviewStatus === 'approved').length;
    const rejectedChunkCount = nextChunks.filter((chunk) => chunk.reviewStatus === 'rejected').length;
    const indexedChunkCount = nextChunks.filter((chunk) => chunk.indexStatus === 'indexed').length;
    const nextRowBatchProgress = state.rowBatchProgress
      ? {
          ...state.rowBatchProgress,
          currentBatchIndex: state.rowBatchProgress.currentBatchIndex + 1,
          processedChunks: state.rowBatchProgress.processedChunks + nextChunks.length,
          approvedChunks: state.rowBatchProgress.approvedChunks + approvedChunkCount,
          rejectedChunks: state.rowBatchProgress.rejectedChunks + rejectedChunkCount,
          indexedChunks: state.rowBatchProgress.indexedChunks + indexedChunkCount,
        }
      : undefined;

    return {
      status: 'INDEXING',
      chunks: nextChunks,
      chunkTasks: isRowBatchMode ? [] : state.chunkTasks,
      currentRowBatch: isRowBatchMode ? undefined : state.currentRowBatch,
      validationIssues: isRowBatchMode ? [] : state.validationIssues,
      reviewTasks: isRowBatchMode ? [] : state.reviewTasks,
      rowBatchProgress: nextRowBatchProgress,
      metrics: {
        ...state.metrics,
        totalChunks: isRowBatchMode
          ? nextRowBatchProgress?.processedChunks ?? nextChunks.length
          : indexableChunks.length,
        approvedChunks: isRowBatchMode
          ? nextRowBatchProgress?.approvedChunks ?? approvedChunkCount
          : approvedChunkCount,
        rejectedChunks: isRowBatchMode
          ? nextRowBatchProgress?.rejectedChunks ?? rejectedChunkCount
          : rejectedChunkCount,
        indexedChunks: isRowBatchMode
          ? nextRowBatchProgress?.indexedChunks ?? indexedChunkCount
          : indexedChunkCount,
      },
    };
  };
}

export const writeVectorIndexNode = createWriteVectorIndexNode();

import { randomUUID } from 'node:crypto';

import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
  isGraphInterrupt,
} from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

import type { ChunkContract, ChunkTaskContract } from '../contracts/chunk';
import type { DocumentContract } from '../contracts/document';
import type { SectionContract } from '../contracts/section';
import type { StepTraceContract } from '../contracts/trace';
import { generateEmbedding } from '../../ai/embeddings';
import { ingestionStorage } from '../storage/repositories';
import type { IngestionStorage } from '../storage/types';
import { createPostgresCheckpointer } from './checkpointer';
import { aggregateChunksNode } from './nodes/aggregate-chunks';
import { createAggregateEnrichmentNode } from './nodes/aggregate-enrichment';
import { buildChunkTasksNode } from './nodes/build-chunk-tasks';
import { createChooseChunkStrategyNode } from './nodes/choose-chunk-strategy';
import { createClassifyDocumentNode } from './nodes/classify-document';
import { createFinalizeReportNode } from './nodes/finalize-report';
import { loadSourceDescriptorNode } from './nodes/load-source-descriptor';
import { createPersistChunksNode } from './nodes/persist-chunks';
import { receiveIngestionRequestNode } from './nodes/receive-request';
import { createReviewGateNode } from './nodes/review-gate';
import { resolveParserStrategyNode } from './nodes/resolve-parser-strategy';
import { createValidateChunksNode } from './nodes/validate-chunks';
import { createWriteVectorIndexNode } from './nodes/write-vector-index';
import { createDocxParserSubgraph } from './subgraphs/docx-parser';
import { createHtmlParserSubgraph } from './subgraphs/html-parser';
import { createPdfParserSubgraph } from './subgraphs/pdf-parser';
import { createXlsxParserSubgraph } from './subgraphs/xlsx-parser';
import type { IngestionDecisionProvider } from '../services/llm-decision-provider';
import type { IngestionState, IngestionStatus } from './state';

const IngestionGraphAnnotation = Annotation.Root({
  ingestionId: Annotation<string>(),
  documentId: Annotation<string>(),
  executionMode: Annotation<IngestionState['executionMode']>(),
  sourceUri: Annotation<string>(),
  originalFilename: Annotation<string>(),
  mimeType: Annotation<string>(),
  previewText: Annotation<string | undefined>(),
  status: Annotation<IngestionStatus>(),
  docType: Annotation<IngestionState['docType']>(),
  parserStrategy: Annotation<IngestionState['parserStrategy']>(),
  initialChunkingHypothesis: Annotation<IngestionState['initialChunkingHypothesis']>(),
  chunkingStrategy: Annotation<IngestionState['chunkingStrategy']>(),
  chunkStrategyConfidence: Annotation<IngestionState['chunkStrategyConfidence']>(),
  chunkStrategyReason: Annotation<IngestionState['chunkStrategyReason']>(),
  fallbackChunkingStrategy: Annotation<IngestionState['fallbackChunkingStrategy']>(),
  priorityFeatures: Annotation<string[] | undefined>(),
  document: Annotation<DocumentContract | undefined>(),
  sections: Annotation<SectionContract[] | undefined>(),
  rowBatchPlan: Annotation<IngestionState['rowBatchPlan']>(),
  rowBatchProgress: Annotation<IngestionState['rowBatchProgress']>(),
  currentRowBatch: Annotation<IngestionState['currentRowBatch']>(),
  chunkTasks: Annotation<ChunkTaskContract[] | undefined>(),
  chunks: Annotation<ChunkContract[] | undefined>(),
  validationIssues: Annotation<IngestionState['validationIssues']>(),
  reviewTasks: Annotation<IngestionState['reviewTasks']>(),
  metrics: Annotation<IngestionState['metrics'] | undefined>(),
  trace: Annotation<StepTraceContract[] | undefined>(),
  error: Annotation<IngestionState['error'] | undefined>(),
});

function summarizeStateSnapshot(state: Partial<IngestionState>) {
  return {
    status: state.status,
    executionMode: state.executionMode,
    docType: state.docType,
    parserStrategy: state.parserStrategy,
    chunkingStrategy: state.chunkingStrategy,
    initialChunkingHypothesis: state.initialChunkingHypothesis,
    hasDocument: Boolean(state.document),
    sectionCount: state.sections?.length ?? 0,
    rowBatchCount: state.rowBatchPlan?.totalBatches ?? 0,
    currentBatchIndex: state.rowBatchProgress?.currentBatchIndex ?? 0,
    chunkCount: state.chunks?.length ?? 0,
    reviewTaskCount: state.reviewTasks?.length ?? 0,
    validationIssueCount: state.validationIssues?.length ?? 0,
  };
}

function toTraceError(error: unknown) {
  if (error instanceof Error) {
    return {
      code: error.name || 'Error',
      message: error.message,
    };
  }

  return {
    code: 'UnknownError',
    message: String(error),
  };
}

function isCheckpointerInterruptFallback(error: unknown, nodeName: string) {
  return (
    nodeName === 'review_gate' &&
    error instanceof Error &&
    /No checkpointer set/i.test(error.message)
  );
}

function createTracedNode(
  nodeName: string,
  node: (state: IngestionState) => Promise<Partial<IngestionState>>,
  storage: IngestionStorage
) {
  return async function tracedNode(state: IngestionState): Promise<Partial<IngestionState>> {
    const startedAt = new Date().toISOString();
    const inputSummary = summarizeStateSnapshot(state);

    await storage.ensureIngestionRun?.({
      ingestionId: state.ingestionId,
      documentId: state.documentId,
      status: state.status,
      sourceUri: state.sourceUri,
      mimeType: state.mimeType,
      docType: state.docType,
      parserStrategy: state.parserStrategy,
      chunkingStrategy: state.chunkingStrategy,
    });

    try {
      const output = await node(state);

      await storage.saveStepTrace?.({
        traceId: randomUUID(),
        ingestionId: state.ingestionId,
        nodeName,
        status: 'completed',
        startedAt,
        finishedAt: new Date().toISOString(),
        inputSummary,
        outputSummary: summarizeStateSnapshot({
          ...state,
          ...output,
        }),
      });

      return output;
    } catch (error) {
      if (isCheckpointerInterruptFallback(error, nodeName)) {
        await storage.saveStepTrace?.({
          traceId: randomUUID(),
          ingestionId: state.ingestionId,
          nodeName,
          status: 'interrupted',
          startedAt,
          finishedAt: new Date().toISOString(),
          inputSummary,
          outputSummary: summarizeStateSnapshot(state),
        });

        return {
          status: 'REVIEW_REQUIRED',
        };
      }

      await storage.saveStepTrace?.({
        traceId: randomUUID(),
        ingestionId: state.ingestionId,
        nodeName,
        status: isGraphInterrupt(error) ? 'interrupted' : 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        inputSummary,
        outputSummary: isGraphInterrupt(error) ? summarizeStateSnapshot(state) : undefined,
        error: isGraphInterrupt(error) ? undefined : toTraceError(error),
      });

      throw error;
    }
  };
}

function routeParseOrClassifyNode(state: IngestionState) {
  if (state.document && state.sections?.length) {
    return 'classify_document';
  }

  switch (state.parserStrategy) {
    case 'xlsx':
      return 'parse_xlsx';
    case 'docx':
      return 'parse_docx';
    case 'html':
      return 'parse_html';
    case 'pdf':
    default:
      return 'parse_pdf';
  }
}

function routePostChooseNode(state: IngestionState) {
  if (state.reviewTasks?.length || state.status === 'REVIEW_REQUIRED') {
    return 'persist_chunks';
  }

  if (state.chunks?.length) {
    return 'aggregate_enrichment';
  }

  if (state.chunkTasks?.length) {
    return 'aggregate_chunks';
  }

  return 'build_chunk_tasks';
}

function routePostAggregateChunksNode(state: IngestionState) {
  if (state.executionMode === 'strategy_check') {
    return 'finalize_report';
  }

  if (state.reviewTasks?.length || state.status === 'REVIEW_REQUIRED') {
    return 'persist_chunks';
  }

  return 'aggregate_enrichment';
}

function routePostPersistNode(state: IngestionState) {
  if (state.status === 'REVIEW_REQUIRED') {
    return 'review_gate';
  }

  return state.status === 'REJECTED' ? 'finalize_report' : 'write_vector_index';
}

function routePostReviewGateNode(state: IngestionState) {
  return state.status === 'REVIEW_REQUIRED' ? 'finalize_report' : 'persist_chunks';
}

function routePostWriteVectorIndexNode(state: IngestionState) {
  if (
    state.rowBatchProgress &&
    state.rowBatchProgress.currentBatchIndex < state.rowBatchProgress.totalBatches
  ) {
    return 'build_chunk_tasks';
  }

  return 'finalize_report';
}

export async function createIngestionGraph({
  checkpointer = true,
  storage = ingestionStorage,
  generateEmbeddingFn = generateEmbedding,
  decisionProvider,
}: {
  checkpointer?: boolean | BaseCheckpointSaver;
  storage?: IngestionStorage;
  generateEmbeddingFn?: (text: string) => Promise<number[]>;
  decisionProvider?: IngestionDecisionProvider;
} = {}) {
  const xlsxParserSubgraph = createXlsxParserSubgraph();
  const docxParserSubgraph = createDocxParserSubgraph();
  const htmlParserSubgraph = createHtmlParserSubgraph();
  const pdfParserSubgraph = createPdfParserSubgraph();

  const persistChunksNode = createPersistChunksNode(storage);
  const reviewGateNode = createReviewGateNode(storage);
  const classifyDocumentNode = createClassifyDocumentNode(decisionProvider);
  const chooseChunkStrategyNode = createChooseChunkStrategyNode(decisionProvider);
  const aggregateEnrichmentNode = createAggregateEnrichmentNode(decisionProvider);
  const validateChunksNode = createValidateChunksNode(decisionProvider);
  const writeVectorIndexNode = createWriteVectorIndexNode({
    generateEmbeddingFn,
    storage,
  });
  const finalizeReportNode = createFinalizeReportNode(storage);

  const builder = new StateGraph(IngestionGraphAnnotation)
    .addNode(
      'receive_ingestion_request',
      createTracedNode('receive_ingestion_request', receiveIngestionRequestNode, storage)
    )
    .addNode(
      'load_source_descriptor',
      createTracedNode('load_source_descriptor', loadSourceDescriptorNode, storage)
    )
    .addNode(
      'resolve_parser_strategy',
      createTracedNode('resolve_parser_strategy', resolveParserStrategyNode, storage)
    )
    .addNode(
      'parse_xlsx',
      createTracedNode(
        'parse_xlsx',
        async (state) => ({
          ...(await xlsxParserSubgraph.invoke({
            documentId: state.documentId,
            sourceUri: state.sourceUri,
          })),
          status: 'PARSED',
        }),
        storage
      )
    )
    .addNode(
      'parse_docx',
      createTracedNode(
        'parse_docx',
        async (state) => ({
          ...(await docxParserSubgraph.invoke({
            documentId: state.documentId,
            sourceUri: state.sourceUri,
          })),
          status: 'PARSED',
        }),
        storage
      )
    )
    .addNode(
      'parse_html',
      createTracedNode(
        'parse_html',
        async (state) => ({
          ...(await htmlParserSubgraph.invoke({
            documentId: state.documentId,
            sourceUri: state.sourceUri,
          })),
          status: 'PARSED',
        }),
        storage
      )
    )
    .addNode(
      'parse_pdf',
      createTracedNode(
        'parse_pdf',
        async (state) => ({
          ...(await pdfParserSubgraph.invoke({
            documentId: state.documentId,
            sourceUri: state.sourceUri,
          })),
          status: 'PARSED',
        }),
        storage
      )
    )
    .addNode(
      'classify_document',
      createTracedNode('classify_document', classifyDocumentNode, storage)
    )
    .addNode(
      'choose_chunk_strategy',
      createTracedNode('choose_chunk_strategy', chooseChunkStrategyNode, storage)
    )
    .addNode('build_chunk_tasks', createTracedNode('build_chunk_tasks', buildChunkTasksNode, storage))
    .addNode('aggregate_chunks', createTracedNode('aggregate_chunks', aggregateChunksNode, storage))
    .addNode(
      'aggregate_enrichment',
      createTracedNode('aggregate_enrichment', aggregateEnrichmentNode, storage)
    )
    .addNode('validate_chunks', createTracedNode('validate_chunks', validateChunksNode, storage))
    .addNode('review_gate', createTracedNode('review_gate', reviewGateNode, storage))
    .addNode('persist_chunks', createTracedNode('persist_chunks', persistChunksNode, storage))
    .addNode(
      'write_vector_index',
      createTracedNode('write_vector_index', writeVectorIndexNode, storage)
    )
    .addNode('finalize_report', createTracedNode('finalize_report', finalizeReportNode, storage))
    .addEdge(START, 'receive_ingestion_request')
    .addEdge('receive_ingestion_request', 'load_source_descriptor')
    .addEdge('load_source_descriptor', 'resolve_parser_strategy')
    .addConditionalEdges('resolve_parser_strategy', routeParseOrClassifyNode, [
      'classify_document',
      'parse_xlsx',
      'parse_docx',
      'parse_html',
      'parse_pdf',
    ])
    .addEdge('parse_xlsx', 'classify_document')
    .addEdge('parse_docx', 'classify_document')
    .addEdge('parse_html', 'classify_document')
    .addEdge('parse_pdf', 'classify_document')
    .addEdge('classify_document', 'choose_chunk_strategy')
    .addConditionalEdges('choose_chunk_strategy', routePostChooseNode, [
      'build_chunk_tasks',
      'aggregate_chunks',
      'aggregate_enrichment',
      'persist_chunks',
    ])
    .addEdge('build_chunk_tasks', 'aggregate_chunks')
    .addConditionalEdges('aggregate_chunks', routePostAggregateChunksNode, [
      'finalize_report',
      'persist_chunks',
      'aggregate_enrichment',
    ])
    .addEdge('aggregate_enrichment', 'validate_chunks')
    .addEdge('validate_chunks', 'persist_chunks')
    .addConditionalEdges('review_gate', routePostReviewGateNode, [
      'persist_chunks',
      'finalize_report',
    ])
    .addConditionalEdges('persist_chunks', routePostPersistNode, [
      'review_gate',
      'write_vector_index',
      'finalize_report',
    ])
    .addConditionalEdges('write_vector_index', routePostWriteVectorIndexNode, [
      'build_chunk_tasks',
      'finalize_report',
    ])
    .addEdge('finalize_report', END);

  if (!checkpointer) {
    return builder.compile();
  }

  if (checkpointer instanceof MemorySaver) {
    return builder.compile({
      checkpointer,
    });
  }

  if (typeof checkpointer === 'object') {
    return builder.compile({
      checkpointer,
    });
  }

  const postgresCheckpointer = await createPostgresCheckpointer();
  return builder.compile({
    checkpointer: postgresCheckpointer,
  });
}

import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

import type { ChunkContract, ChunkTaskContract } from '../contracts/chunk';
import type { DocumentContract } from '../contracts/document';
import type { SectionContract } from '../contracts/section';
import type { IngestionState, IngestionStatus } from './state';
import { createPostgresCheckpointer } from './checkpointer';
import { aggregateChunksNode } from './nodes/aggregate-chunks';
import { aggregateEnrichmentNode } from './nodes/aggregate-enrichment';
import { buildChunkTasksNode } from './nodes/build-chunk-tasks';
import { chooseChunkStrategyNode } from './nodes/choose-chunk-strategy';
import { classifyDocumentNode } from './nodes/classify-document';
import { extractStructureNode } from './nodes/extract-structure';
import { finalizeReportNode } from './nodes/finalize-report';
import { loadSourceDescriptorNode } from './nodes/load-source-descriptor';
import { persistChunksNode } from './nodes/persist-chunks';
import { receiveIngestionRequestNode } from './nodes/receive-request';
import { reviewGateNode } from './nodes/review-gate';
import { validateChunksNode } from './nodes/validate-chunks';
import { writeVectorIndexNode } from './nodes/write-vector-index';

const IngestionGraphAnnotation = Annotation.Root({
  ingestionId: Annotation<string>(),
  documentId: Annotation<string>(),
  sourceUri: Annotation<string>(),
  originalFilename: Annotation<string>(),
  mimeType: Annotation<string>(),
  status: Annotation<IngestionStatus>(),
  docType: Annotation<IngestionState['docType']>(),
  parserStrategy: Annotation<IngestionState['parserStrategy']>(),
  chunkingStrategy: Annotation<IngestionState['chunkingStrategy']>(),
  priorityFeatures: Annotation<string[] | undefined>(),
  document: Annotation<DocumentContract | undefined>(),
  sections: Annotation<SectionContract[] | undefined>(),
  chunkTasks: Annotation<ChunkTaskContract[] | undefined>(),
  chunks: Annotation<ChunkContract[] | undefined>(),
  validationIssues: Annotation<IngestionState['validationIssues']>(),
  reviewTasks: Annotation<IngestionState['reviewTasks']>(),
  metrics: Annotation<IngestionState['metrics'] | undefined>(),
});

export async function createIngestionGraph({
  checkpointer = true,
}: {
  checkpointer?: boolean | BaseCheckpointSaver;
} = {}) {
  const builder = new StateGraph(IngestionGraphAnnotation)
    .addNode('receive_ingestion_request', receiveIngestionRequestNode)
    .addNode('load_source_descriptor', loadSourceDescriptorNode)
    .addNode('classify_document', classifyDocumentNode)
    .addNode('extract_structure', extractStructureNode)
    .addNode('choose_chunk_strategy', chooseChunkStrategyNode)
    .addNode('build_chunk_tasks', buildChunkTasksNode)
    .addNode('aggregate_chunks', aggregateChunksNode)
    .addNode('aggregate_enrichment', aggregateEnrichmentNode)
    .addNode('validate_chunks', validateChunksNode)
    .addNode('review_gate', reviewGateNode)
    .addNode('persist_chunks', persistChunksNode)
    .addNode('write_vector_index', writeVectorIndexNode)
    .addNode('finalize_report', finalizeReportNode)
    .addEdge(START, 'receive_ingestion_request')
    .addEdge('receive_ingestion_request', 'load_source_descriptor')
    .addEdge('load_source_descriptor', 'classify_document')
    .addEdge('classify_document', 'extract_structure')
    .addEdge('extract_structure', 'choose_chunk_strategy')
    .addEdge('choose_chunk_strategy', 'build_chunk_tasks')
    .addEdge('build_chunk_tasks', 'aggregate_chunks')
    .addEdge('aggregate_chunks', 'aggregate_enrichment')
    .addEdge('aggregate_enrichment', 'validate_chunks')
    .addEdge('validate_chunks', 'review_gate')
    .addEdge('review_gate', 'persist_chunks')
    .addEdge('persist_chunks', 'write_vector_index')
    .addEdge('write_vector_index', 'finalize_report')
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

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import type { XlsxRowBatchPlan } from '../../services/parsers/xlsx';

type ParserSubgraphState = {
  documentId: string;
  sourceUri: string;
  document?: DocumentContract;
  sections?: SectionContract[];
  rowBatchPlan?: XlsxRowBatchPlan;
};

export type ParserSubgraph = {
  invoke(input: { documentId: string; sourceUri: string }): Promise<{
    document: DocumentContract;
    sections: SectionContract[];
    rowBatchPlan?: XlsxRowBatchPlan;
  }>;
};

const ParserSubgraphAnnotation = Annotation.Root({
  documentId: Annotation<string>(),
  sourceUri: Annotation<string>(),
  document: Annotation<DocumentContract | undefined>(),
  sections: Annotation<SectionContract[] | undefined>(),
  rowBatchPlan: Annotation<XlsxRowBatchPlan | undefined>(),
});

export function createParserSubgraph(
  parse: (input: { documentId: string; sourceUri: string }) => Promise<{
    document: DocumentContract;
    sections: SectionContract[];
    rowBatchPlan?: XlsxRowBatchPlan;
  }>
) {
  return new StateGraph(ParserSubgraphAnnotation)
    .addNode('parse', async (state: ParserSubgraphState) => parse(state))
    .addEdge(START, 'parse')
    .addEdge('parse', END)
    .compile() as ParserSubgraph;
}

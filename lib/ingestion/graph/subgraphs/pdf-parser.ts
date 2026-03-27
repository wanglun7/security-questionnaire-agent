import { parsePdfDocument } from '../../services/parsers/pdf';
import { createParserSubgraph } from './parser-subgraph';

import type { IngestionState } from '../state';

export function createPdfParserSubgraph() {
  return createParserSubgraph(parsePdfDocument);
}

export async function runPdfParserSubgraph(state: IngestionState) {
  return createPdfParserSubgraph().invoke({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

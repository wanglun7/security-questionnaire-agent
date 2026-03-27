import { parseXlsxDocument } from '../../services/parsers/xlsx';
import { createParserSubgraph } from './parser-subgraph';

import type { IngestionState } from '../state';

export function createXlsxParserSubgraph() {
  return createParserSubgraph(parseXlsxDocument);
}

export async function runXlsxParserSubgraph(state: IngestionState) {
  return createXlsxParserSubgraph().invoke({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

import { parseHtmlDocument } from '../../services/parsers/html';
import { createParserSubgraph } from './parser-subgraph';

import type { IngestionState } from '../state';

export function createHtmlParserSubgraph() {
  return createParserSubgraph(parseHtmlDocument);
}

export async function runHtmlParserSubgraph(state: IngestionState) {
  return createHtmlParserSubgraph().invoke({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

import { parseDocxDocument } from '../../services/parsers/docx';
import { createParserSubgraph } from './parser-subgraph';

import type { IngestionState } from '../state';

export function createDocxParserSubgraph() {
  return createParserSubgraph(parseDocxDocument);
}

export async function runDocxParserSubgraph(state: IngestionState) {
  return createDocxParserSubgraph().invoke({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

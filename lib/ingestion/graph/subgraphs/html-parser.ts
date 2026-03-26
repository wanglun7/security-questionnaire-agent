import { parseHtmlDocument } from '../../services/parsers/html';

import type { IngestionState } from '../state';

export async function runHtmlParserSubgraph(state: IngestionState) {
  return parseHtmlDocument({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

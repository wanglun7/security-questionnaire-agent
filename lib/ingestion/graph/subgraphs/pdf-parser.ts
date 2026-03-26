import { parsePdfDocument } from '../../services/parsers/pdf';

import type { IngestionState } from '../state';

export async function runPdfParserSubgraph(state: IngestionState) {
  return parsePdfDocument({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

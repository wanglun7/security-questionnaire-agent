import { parseXlsxDocument } from '../../services/parsers/xlsx';

import type { IngestionState } from '../state';

export async function runXlsxParserSubgraph(state: IngestionState) {
  return parseXlsxDocument({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

import { parseDocxDocument } from '../../services/parsers/docx';

import type { IngestionState } from '../state';

export async function runDocxParserSubgraph(state: IngestionState) {
  return parseDocxDocument({
    documentId: state.documentId,
    sourceUri: state.sourceUri,
  });
}

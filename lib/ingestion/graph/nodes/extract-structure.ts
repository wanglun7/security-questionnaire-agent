import { runDocxParserSubgraph } from '../subgraphs/docx-parser';
import { runHtmlParserSubgraph } from '../subgraphs/html-parser';
import { runPdfParserSubgraph } from '../subgraphs/pdf-parser';
import { runXlsxParserSubgraph } from '../subgraphs/xlsx-parser';

import type { IngestionState } from '../state';

export async function extractStructureNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  if (state.parserStrategy === 'xlsx') {
    const parsed = await runXlsxParserSubgraph(state);
    return { ...parsed, status: 'PARSED' };
  }

  if (state.parserStrategy === 'docx') {
    const parsed = await runDocxParserSubgraph(state);
    return { ...parsed, status: 'PARSED' };
  }

  if (state.parserStrategy === 'html') {
    const parsed = await runHtmlParserSubgraph(state);
    return { ...parsed, status: 'PARSED' };
  }

  const parsed = await runPdfParserSubgraph(state);
  return { ...parsed, status: 'PARSED' };
}

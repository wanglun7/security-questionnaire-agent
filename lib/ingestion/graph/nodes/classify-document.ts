import { classifyDocument } from '../../services/document-classifier';

import type { IngestionState } from '../state';

export async function classifyDocumentNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  const classification = await classifyDocument({
    mimeType: state.mimeType,
    originalFilename: state.originalFilename,
  });

  return {
    ...classification,
    status: 'CLASSIFIED',
  };
}

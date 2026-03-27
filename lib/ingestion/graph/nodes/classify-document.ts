import { classifyDocument } from '../../services/document-classifier';
import type { IngestionDecisionProvider } from '../../services/llm-decision-provider';

import type { IngestionState } from '../state';

export function createClassifyDocumentNode(
  provider?: Pick<IngestionDecisionProvider, 'classifyDocument'>
) {
  return async function classifyDocumentNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    if (state.docType && state.initialChunkingHypothesis) {
      return {
        docType: state.docType,
        initialChunkingHypothesis: state.initialChunkingHypothesis,
        priorityFeatures: state.priorityFeatures,
        status: 'CLASSIFIED',
      };
    }

    const classification = await classifyDocument(
      {
        parserStrategy: state.parserStrategy ?? 'pdf',
        mimeType: state.mimeType,
        originalFilename: state.originalFilename,
        previewText: state.previewText,
        sectionCount: state.document?.sectionCount ?? state.sections?.length,
        sampledSectionCount: state.sections?.length,
        sections: state.sections ?? [],
      },
      { provider }
    );

    return {
      ...classification,
      status: 'CLASSIFIED',
    };
  };
}

export const classifyDocumentNode = createClassifyDocumentNode();

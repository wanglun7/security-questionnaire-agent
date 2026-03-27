import { chooseChunkStrategy } from '../../services/chunk-strategy';
import type { IngestionDecisionProvider } from '../../services/llm-decision-provider';

import type { IngestionState } from '../state';

export function createChooseChunkStrategyNode(
  provider?: Pick<IngestionDecisionProvider, 'chooseChunkStrategy'>
) {
  return async function chooseChunkStrategyNode(
    state: IngestionState
  ): Promise<Partial<IngestionState>> {
    if (state.chunkingStrategy && !state.initialChunkingHypothesis) {
      return {
        initialChunkingHypothesis: state.chunkingStrategy,
        chunkStrategyConfidence: 'high',
        chunkStrategyReason: 'manual_override',
        fallbackChunkingStrategy: state.chunkingStrategy,
      };
    }

    const decision = await chooseChunkStrategy(
      {
        parserStrategy: state.parserStrategy ?? 'pdf',
        docType: state.docType,
        initialChunkingHypothesis: state.initialChunkingHypothesis,
        priorityFeatures: state.priorityFeatures,
        previewText: state.previewText,
        sectionCount: state.document?.sectionCount ?? state.sections?.length,
        sampledSectionCount: state.sections?.length,
        sections: state.sections ?? [],
      },
      { provider }
    );

    return {
      chunkingStrategy: decision.chunkingStrategy,
      chunkStrategyConfidence: decision.confidence,
      chunkStrategyReason: decision.reason,
      fallbackChunkingStrategy: decision.fallbackStrategy,
    };
  };
}

export const chooseChunkStrategyNode = createChooseChunkStrategyNode();

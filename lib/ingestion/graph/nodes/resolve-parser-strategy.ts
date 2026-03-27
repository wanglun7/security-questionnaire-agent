import { resolveParserStrategy } from '../../services/parser-router';

import type { IngestionState } from '../state';

export async function resolveParserStrategyNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  if (state.parserStrategy) {
    return {
      parserStrategy: state.parserStrategy,
    };
  }

  return {
    parserStrategy: resolveParserStrategy({
      mimeType: state.mimeType,
      originalFilename: state.originalFilename,
    }),
  };
}

import type { ChunkStrategy } from '../contracts/chunk';
import type {
  ChunkStrategyDecisionContract,
  ChunkStrategyDecisionInput,
} from '../contracts/decision';
import type { IngestionDecisionProvider } from './llm-decision-provider';

export async function chooseChunkStrategy(
  input: ChunkStrategyDecisionInput,
  options?: {
    provider?: Pick<IngestionDecisionProvider, 'chooseChunkStrategy'>;
  }
): Promise<ChunkStrategyDecisionContract> {
  if (!options?.provider?.chooseChunkStrategy) {
    throw new Error('LLM decision provider is required for chunk strategy selection');
  }

  const decision = await options.provider.chooseChunkStrategy(input);
  if (!decision) {
    throw new Error('LLM chunk strategy selection returned no decision');
  }

  return decision;
}

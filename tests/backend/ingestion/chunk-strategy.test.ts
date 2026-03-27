import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseChunkStrategy } from '../../../lib/ingestion/services/chunk-strategy';

test('chunk strategy requires an LLM provider', async () => {
  await assert.rejects(
    chooseChunkStrategy({
      parserStrategy: 'xlsx',
      docType: 'questionnaire',
      initialChunkingHypothesis: 'row',
      sectionCount: 3,
      sampledSectionCount: 3,
      sections: [
        { kind: 'row_block', textRef: 'row 1' },
        { kind: 'row_block', textRef: 'row 2' },
        { kind: 'row_block', textRef: 'row 3' },
      ],
    }),
    /LLM decision provider is required for chunk strategy selection/i
  );
});

test('chunk strategy can use structured LLM decision output when provider is supplied', async () => {
  const result = await chooseChunkStrategy(
    {
      parserStrategy: 'pdf',
      docType: 'policy',
      initialChunkingHypothesis: 'section',
      sectionCount: 1,
      sampledSectionCount: 1,
      sections: [{ kind: 'paragraph_block', textRef: 'policy paragraph' }],
    },
    {
      provider: {
        chooseChunkStrategy: async () => ({
          chunkingStrategy: 'clause',
          confidence: 'high',
          reason: 'doc_type_contract',
          fallbackStrategy: 'section',
        }),
      },
    }
  );

  assert.equal(result.chunkingStrategy, 'clause');
  assert.equal(result.confidence, 'high');
});

test('chunk strategy surfaces provider failures instead of falling back', async () => {
  await assert.rejects(
    chooseChunkStrategy(
      {
        parserStrategy: 'html',
        docType: 'policy',
        initialChunkingHypothesis: 'section',
        previewText: 'Overview\nCapabilities\nSecurity controls',
        sectionCount: 3,
        sampledSectionCount: 3,
        sections: [
          { kind: 'heading', textRef: 'Overview' },
          { kind: 'paragraph_block', textRef: 'Supports SSO and MFA.' },
          { kind: 'table', textRef: 'Control | Status' },
        ],
      },
      {
        provider: {
          chooseChunkStrategy: async () => {
            throw new Error('llm unavailable');
          },
        },
      }
    ),
    /llm unavailable/i
  );
});

test('chunk strategy provider receives parser and section cardinality context', async () => {
  let receivedParserStrategy: string | undefined;
  let receivedSectionCount: number | undefined;
  let receivedSampledSectionCount: number | undefined;

  await chooseChunkStrategy(
    {
      parserStrategy: 'pdf',
      docType: 'contract',
      initialChunkingHypothesis: 'clause',
      sectionCount: 142,
      sampledSectionCount: 142,
      sections: [{ kind: 'clause_block', textRef: '1.1 Confidentiality obligations' }],
    },
    {
      provider: {
        chooseChunkStrategy: async (input) => {
          receivedParserStrategy = input.parserStrategy;
          receivedSectionCount = input.sectionCount;
          receivedSampledSectionCount = input.sampledSectionCount;
          return {
            chunkingStrategy: 'clause',
            confidence: 'high',
            reason: 'clause_block_dominant',
            fallbackStrategy: 'clause',
          };
        },
      },
    }
  );

  assert.equal(receivedParserStrategy, 'pdf');
  assert.equal(receivedSectionCount, 142);
  assert.equal(receivedSampledSectionCount, 142);
});

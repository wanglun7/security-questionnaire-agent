import { createHash } from 'node:crypto';

import type { ChunkContract } from '../contracts/chunk';

const REINDEX_FIELDS: Array<keyof ChunkContract> = [
  'cleanText',
  'contextualText',
  'title',
  'summary',
  'keywords',
  'entities',
  'questionsAnswered',
  'effectiveDate',
  'version',
  'authorityLevel',
  'aclTags',
];

export type ChunkMetadataPatch = Partial<
  Pick<
    ChunkContract,
    | 'cleanText'
    | 'contextualText'
    | 'title'
    | 'summary'
    | 'keywords'
    | 'entities'
    | 'questionsAnswered'
    | 'version'
    | 'effectiveDate'
    | 'authorityLevel'
    | 'versionGuess'
    | 'authorityGuess'
    | 'aclTags'
    | 'metadataVersion'
  >
>;

export function computeChunkChecksum(chunk: Pick<ChunkContract, 'cleanText' | 'contextualText'>) {
  return createHash('sha256')
    .update(chunk.cleanText)
    .update('\n')
    .update(chunk.contextualText ?? '')
    .digest('hex');
}

export function diffChunkMetadata(before: ChunkContract, patch: ChunkMetadataPatch) {
  const after: ChunkContract = {
    ...before,
    ...patch,
  };

  const changes = Object.keys(patch).flatMap((field) => {
    const key = field as keyof ChunkMetadataPatch & keyof ChunkContract;
    const previousValue = before[key];
    const nextValue = after[key];
    if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
      return [];
    }

    return [
      {
        field: key,
        before: previousValue,
        after: nextValue,
      },
    ];
  });

  const requiresReindex = changes.some((change) =>
    REINDEX_FIELDS.includes(change.field as keyof ChunkContract)
  );

  return {
    after: {
      ...after,
      checksum: computeChunkChecksum(after),
    },
    changes,
    requiresReindex,
  };
}

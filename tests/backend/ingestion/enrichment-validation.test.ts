import test from 'node:test';
import assert from 'node:assert/strict';

import { validateEnrichmentMetadata } from '../../../lib/ingestion/services/enrichment-validation';

test('section L2 metadata validation only requires non-empty expected fields', () => {
  const issues = validateEnrichmentMetadata(
    [
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        tenant: 'tenant-a',
        rawTextRef: 'blob://chunk-1',
        cleanText:
          'Employees must submit leave requests through the HR system at least two weeks before the requested start date.',
        title: 'Leave policy',
        summary: 'Explains leave request timing.',
        aclTags: [],
        checksum: 'checksum-1',
        reviewStatus: 'approved',
        indexStatus: 'pending',
        chunkStrategy: 'section',
        span: { paragraphStart: 1, paragraphEnd: 1 },
        metadataVersion: 1,
      },
    ],
    {
      executionMode: 'full_ingestion',
      runDefaultEnrichLevel: 'L2',
    }
  );

  assert.equal(issues.length, 0);
});

test('missing expected non-empty title or summary yields metadata quality issue', () => {
  const issues = validateEnrichmentMetadata(
    [
      {
        chunkId: 'chunk-2',
        documentId: 'doc-1',
        tenant: 'tenant-a',
        rawTextRef: 'blob://chunk-2',
        cleanText:
          'Employees must submit leave requests through the HR system at least two weeks before the requested start date.',
        summary: 'Explains leave request timing.',
        aclTags: [],
        checksum: 'checksum-2',
        reviewStatus: 'approved',
        indexStatus: 'pending',
        chunkStrategy: 'section',
        span: { paragraphStart: 1, paragraphEnd: 1 },
        metadataVersion: 1,
      },
    ],
    {
      executionMode: 'full_ingestion',
      runDefaultEnrichLevel: 'L2',
    }
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, 'LOW_METADATA_QUALITY');
  assert.equal(issues[0]?.requiresHumanReview, true);
});

test('governance-changing review hints trigger human review', () => {
  const issues = validateEnrichmentMetadata(
    [
      {
        chunkId: 'chunk-3',
        documentId: 'doc-1',
        tenant: 'tenant-a',
        rawTextRef: 'blob://chunk-3',
        cleanText:
          '2.1 Audit Rights. Each party may inspect the other party records relevant to this Agreement.',
        title: 'Audit rights',
        summary: 'Defines audit rights.',
        authorityGuess: 'high',
        reviewHints: ['set_authority_high', 'publish_immediately'],
        aclTags: [],
        checksum: 'checksum-3',
        reviewStatus: 'approved',
        indexStatus: 'pending',
        chunkStrategy: 'clause',
        span: { paragraphStart: 1, paragraphEnd: 1 },
        metadataVersion: 1,
      },
    ],
    {
      executionMode: 'full_ingestion',
      runDefaultEnrichLevel: 'L3',
    }
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.requiresHumanReview, true);
  assert.equal(issues[0]?.code, 'LOW_METADATA_QUALITY');
});

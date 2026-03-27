import type { ChunkContract } from '../contracts/chunk';
import type { EnrichmentLevel } from '../contracts/enrichment';
import type { ValidationIssueContract } from '../contracts/review';
import { planChunkEnrichment } from './enrichment-policy';

function isEmptyField(value: unknown) {
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value == null;
}

function hasGovernanceChangingHint(hint: string) {
  return /set_authority|publish|document_status|published/i.test(hint);
}

export function validateEnrichmentMetadata(
  chunks: ChunkContract[],
  options?: {
    executionMode?: 'strategy_check' | 'full_ingestion';
    runDefaultEnrichLevel?: EnrichmentLevel;
  }
): ValidationIssueContract[] {
  const issues: ValidationIssueContract[] = [];

  for (const chunk of chunks) {
    const plan = planChunkEnrichment({
      executionMode: options?.executionMode ?? 'full_ingestion',
      runDefaultEnrichLevel: options?.runDefaultEnrichLevel ?? 'L2',
      chunk,
    });

    for (const field of plan.expectedNonEmptyFields) {
      if (field === 'title' && isEmptyField(chunk.title)) {
        issues.push({
          issueId: `${chunk.chunkId}-missing-title`,
          chunkId: chunk.chunkId,
          severity: 'medium',
          code: 'LOW_METADATA_QUALITY',
          message: 'Expected enriched title is missing.',
          validationTier: 'soft_warning',
          requiresHumanReview: true,
        });
      }

      if (field === 'summary' && isEmptyField(chunk.summary)) {
        issues.push({
          issueId: `${chunk.chunkId}-missing-summary`,
          chunkId: chunk.chunkId,
          severity: 'medium',
          code: 'LOW_METADATA_QUALITY',
          message: 'Expected enriched summary is missing.',
          validationTier: 'soft_warning',
          requiresHumanReview: true,
        });
      }

      if (field === 'questionsAnswered' && isEmptyField(chunk.questionsAnswered)) {
        issues.push({
          issueId: `${chunk.chunkId}-missing-questions-answered`,
          chunkId: chunk.chunkId,
          severity: 'low',
          code: 'LOW_METADATA_QUALITY',
          message: 'Expected questionsAnswered metadata is missing.',
          validationTier: 'soft_warning',
          requiresHumanReview: false,
        });
      }
    }

    if ((chunk.reviewHints ?? []).some(hasGovernanceChangingHint)) {
      issues.push({
        issueId: `${chunk.chunkId}-governance-review-hint`,
        chunkId: chunk.chunkId,
        severity: 'high',
        code: 'LOW_METADATA_QUALITY',
        message: 'Review hints attempt to directly change governance-sensitive state.',
        validationTier: 'soft_warning',
        requiresHumanReview: true,
      });
    }
  }

  return issues;
}

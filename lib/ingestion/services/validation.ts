import type { ChunkContract } from '../contracts/chunk';
import type { ValidationIssueContract } from '../contracts/review';

export function validateChunks(chunks: ChunkContract[]): ValidationIssueContract[] {
  const issues: ValidationIssueContract[] = [];

  for (const chunk of chunks) {
    if (!chunk.cleanText.trim()) {
      issues.push({
        issueId: `${chunk.chunkId}-empty-clean-text`,
        chunkId: chunk.chunkId,
        severity: 'high',
        code: 'LOW_METADATA_QUALITY',
        message: 'Chunk cleanText is empty.',
        requiresHumanReview: true,
      });
    }

    if (Object.keys(chunk.span).length === 0) {
      issues.push({
        issueId: `${chunk.chunkId}-missing-span`,
        chunkId: chunk.chunkId,
        severity: 'high',
        code: 'MISSING_SOURCE_SPAN',
        message: 'Chunk source span is missing.',
        requiresHumanReview: true,
      });
    }
  }

  return issues;
}

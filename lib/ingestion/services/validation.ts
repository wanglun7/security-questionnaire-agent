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
        validationTier: 'hard_fail',
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
        validationTier: 'hard_fail',
        requiresHumanReview: true,
      });
    }

    if (/ignore previous instructions|system prompt|忽略之前的指令/i.test(chunk.cleanText)) {
      issues.push({
        issueId: `${chunk.chunkId}-prompt-injection`,
        chunkId: chunk.chunkId,
        severity: 'high',
        code: 'POSSIBLE_PROMPT_INJECTION',
        message: 'Chunk may contain prompt injection content.',
        validationTier: 'hard_fail',
        requiresHumanReview: true,
      });
    }

    const normalizedLength = chunk.cleanText.trim().length;
    if (normalizedLength > 0 && normalizedLength < 20) {
      issues.push({
        issueId: `${chunk.chunkId}-too-small`,
        chunkId: chunk.chunkId,
        severity: 'medium',
        code: 'CHUNK_TOO_SMALL',
        message: 'Chunk is shorter than the preferred minimum length.',
        validationTier: 'soft_warning',
        requiresHumanReview: false,
      });
    }

    if (normalizedLength > 2000) {
      issues.push({
        issueId: `${chunk.chunkId}-too-large`,
        chunkId: chunk.chunkId,
        severity: 'medium',
        code: 'CHUNK_TOO_LARGE',
        message: 'Chunk is longer than the preferred maximum length.',
        validationTier: 'soft_warning',
        requiresHumanReview: false,
      });
    }

    if (!chunk.title || !chunk.summary || !chunk.keywords?.length) {
      issues.push({
        issueId: `${chunk.chunkId}-metadata-quality`,
        chunkId: chunk.chunkId,
        severity: 'low',
        code: 'LOW_METADATA_QUALITY',
        message: 'Chunk metadata quality is lower than the preferred baseline.',
        validationTier: 'soft_warning',
        requiresHumanReview: false,
      });
    }
  }

  return issues;
}

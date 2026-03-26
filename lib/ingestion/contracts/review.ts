export type ValidationIssueContract = {
  issueId: string;
  chunkId?: string;
  severity: 'low' | 'medium' | 'high';
  code:
    | 'CHUNK_TOO_SMALL'
    | 'CHUNK_TOO_LARGE'
    | 'MISSING_LINEAGE'
    | 'MISSING_SOURCE_SPAN'
    | 'POSSIBLE_PROMPT_INJECTION'
    | 'POSSIBLE_VERSION_CONFLICT'
    | 'LOW_METADATA_QUALITY';
  message: string;
  requiresHumanReview: boolean;
};

export type ReviewTaskContract = {
  reviewTaskId: string;
  ingestionId: string;
  documentId: string;
  scope: 'document' | 'chunk';
  scopeRefId: string;
  reasonCode: string;
  summary: string;
  suggestedAction: 'approve' | 'edit' | 'reject';
};

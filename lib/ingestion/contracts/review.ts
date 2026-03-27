export type ValidationIssueContract = {
  issueId: string;
  chunkId?: string;
  severity: 'low' | 'medium' | 'high';
  validationTier: 'hard_fail' | 'soft_warning';
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

export type ReviewTaskType =
  | 'document_review'
  | 'chunk_review'
  | 'metadata_review'
  | 'strategy_review';

export type ReviewResolutionType =
  | 'approved'
  | 'rejected'
  | 'edited'
  | 'mixed'
  | 'dismissed';

export type ReviewTaskContract = {
  reviewTaskId: string;
  ingestionId: string;
  documentId: string;
  taskType: ReviewTaskType;
  reasonCodes: string[];
  targetDocumentId?: string;
  targetChunkIds?: string[];
  assignee?: string;
  owner?: string;
  summary: string;
  suggestedAction: 'approve' | 'edit' | 'reject';
  status?: 'pending' | 'resolved';
  resolutionType?: ReviewResolutionType;
  resolutionJson?: Record<string, unknown>;
  createdAt?: string;
  resolvedAt?: string;
  scope?: 'document' | 'chunk';
  scopeRefId?: string;
  reasonCode?: string;
};

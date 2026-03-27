import fs from 'node:fs/promises';

import { extractSourcePreviewText } from '../../services/source-descriptor';
import type { IngestionState } from '../state';

export async function loadSourceDescriptorNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  if (!state.document && !state.sections?.length && !state.chunks?.length && !state.reviewTasks?.length) {
    await fs.access(state.sourceUri);
  }

  return {
    sourceUri: state.sourceUri,
    originalFilename: state.originalFilename,
    mimeType: state.mimeType,
    previewText:
      state.previewText ??
      (await extractSourcePreviewText({
        sourceUri: state.sourceUri,
        originalFilename: state.originalFilename,
        mimeType: state.mimeType,
      })),
  };
}

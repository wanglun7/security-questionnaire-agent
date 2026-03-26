import fs from 'node:fs/promises';

import type { IngestionState } from '../state';

export async function loadSourceDescriptorNode(
  state: IngestionState
): Promise<Partial<IngestionState>> {
  await fs.access(state.sourceUri);

  return {
    sourceUri: state.sourceUri,
    originalFilename: state.originalFilename,
    mimeType: state.mimeType,
  };
}

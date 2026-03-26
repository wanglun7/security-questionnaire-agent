import type { ChunkTaskContract } from '../contracts/chunk';
import type { SectionContract } from '../contracts/section';

export function buildChunkTasks({
  documentId,
  chunkingStrategy,
  sections,
}: {
  documentId: string;
  chunkingStrategy: ChunkTaskContract['chunkingStrategy'];
  sections: SectionContract[];
}): ChunkTaskContract[] {
  return sections
    .filter((section) => {
      if (chunkingStrategy === 'row') {
        return section.kind === 'row_block';
      }

      if (chunkingStrategy === 'faq') {
        return section.kind === 'faq_block';
      }

      if (chunkingStrategy === 'clause') {
        return section.kind === 'clause_block';
      }

      return section.kind !== 'heading';
    })
    .map((section, index) => ({
      taskId: `${documentId}-task-${index + 1}`,
      documentId,
      sectionId: section.sectionId,
      chunkingStrategy,
      textRef: section.textRef,
      span: section.span,
    }));
}

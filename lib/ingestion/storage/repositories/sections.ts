import { eq } from 'drizzle-orm';

import { db } from '../../../db/client';
import { documentSections } from '../../../db/schema';
import type { SectionContract } from '../../contracts/section';

export async function replaceSections(
  documentId: string,
  sections: SectionContract[]
) {
  await db.delete(documentSections).where(eq(documentSections.documentId, documentId));

  if (sections.length === 0) {
    return;
  }

  await db.insert(documentSections).values(
    sections.map((section) => ({
      id: section.sectionId,
      documentId: section.documentId,
      parentSectionId: section.parentSectionId,
      kind: section.kind,
      title: section.title,
      textRef: section.textRef,
      spanJson: section.span,
    }))
  );
}

export async function upsertSections(sections: SectionContract[]) {
  if (sections.length === 0) {
    return;
  }

  await db
    .insert(documentSections)
    .values(
      sections.map((section) => ({
        id: section.sectionId,
        documentId: section.documentId,
        parentSectionId: section.parentSectionId,
        kind: section.kind,
        title: section.title,
        textRef: section.textRef,
        spanJson: section.span,
      }))
    )
    .onConflictDoNothing({
      target: documentSections.id,
    });
}

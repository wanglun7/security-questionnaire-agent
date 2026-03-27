import { eq } from 'drizzle-orm';

import { db } from '../../../db/client';
import { documents } from '../../../db/schema';
import type { DocumentContract } from '../../contracts/document';

export async function upsertDocument(document: DocumentContract) {
  await db
    .insert(documents)
    .values({
      id: document.documentId,
      sourceUri: document.sourceUri,
      mimeType: document.mimeType,
      originalFilename: document.sourceUri.split('/').pop() ?? document.documentId,
      docType: document.docType,
      checksum: document.checksum,
    })
    .onConflictDoUpdate({
      target: documents.id,
      set: {
        sourceUri: document.sourceUri,
        mimeType: document.mimeType,
        docType: document.docType,
        checksum: document.checksum,
      },
    });

  return db.query.documents.findFirst({
    where: eq(documents.id, document.documentId),
  });
}

import { NextRequest, NextResponse } from 'next/server';

import { updateAnswerContent } from '@/lib/projects/service';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { editedContent?: string };

    await updateAnswerContent({
      answerId: id,
      editedContent: body.editedContent ?? '',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update answer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

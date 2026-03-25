import { NextRequest, NextResponse } from 'next/server';

import { previewProjectFile } from '@/lib/projects/service';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const preview = await previewProjectFile(id);

    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview failed';
    const status = message === 'Project not found' ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

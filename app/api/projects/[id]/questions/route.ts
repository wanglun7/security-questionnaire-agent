import { NextRequest, NextResponse } from 'next/server';

import { listProjectQuestions } from '@/lib/projects/service';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await listProjectQuestions(id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load questions';
    const status = message === 'Project not found' ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

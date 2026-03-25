import { NextRequest, NextResponse } from 'next/server';

import { getProjectDetail } from '@/lib/projects/service';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const project = await getProjectDetail(id);

    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project';
    const status = message === 'Project not found' ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

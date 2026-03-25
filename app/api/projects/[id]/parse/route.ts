import { NextRequest, NextResponse } from 'next/server';

import { parseProjectFile } from '@/lib/projects/service';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { sheetIndex?: number; columnIndex?: number };
    const result = await parseProjectFile({
      projectId: id,
      sheetIndex: body.sheetIndex ?? 0,
      columnIndex: body.columnIndex ?? 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parse failed';
    const status = message === 'Project not found' ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

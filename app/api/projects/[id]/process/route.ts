import { NextRequest, NextResponse } from 'next/server';

import { processProjectQuestions } from '@/lib/projects/service';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await processProjectQuestions(id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Process failed';
    const status = message === 'Project not found' ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

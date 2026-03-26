import { NextRequest, NextResponse } from 'next/server';

import { resumeIngestion } from '@/lib/ingestion/api/resume-ingestion';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await resumeIngestion(id, body.decision ?? body);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume ingestion';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

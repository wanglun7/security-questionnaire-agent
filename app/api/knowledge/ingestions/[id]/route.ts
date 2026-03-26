import { NextRequest, NextResponse } from 'next/server';

import { getIngestionState } from '@/lib/ingestion/api/get-ingestion-state';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await getIngestionState(id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load ingestion state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

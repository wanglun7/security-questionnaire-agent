import { NextRequest, NextResponse } from 'next/server';

import { startIngestion } from '@/lib/ingestion/api/start-ingestion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await startIngestion(body);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start ingestion';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

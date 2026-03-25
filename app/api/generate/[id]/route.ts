import { NextRequest, NextResponse } from 'next/server';
import { processProjectQuestions } from '@/lib/projects/service';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = await processProjectQuestions(id);

  return NextResponse.json(result);
}

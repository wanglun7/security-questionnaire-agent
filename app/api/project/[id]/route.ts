import { NextRequest, NextResponse } from 'next/server';
import { getProjectDetail } from '@/lib/projects/service';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const project = await getProjectDetail(id);

  return NextResponse.json(
    project.questions.map((question) => ({
      id: question.id,
      text: question.text,
      orderNum: question.orderNum,
      answer: question.answer
        ? {
            content: question.answer.editedContent || question.answer.content,
          }
        : null,
    }))
  );
}

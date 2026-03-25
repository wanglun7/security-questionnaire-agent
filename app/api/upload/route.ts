import { NextRequest, NextResponse } from 'next/server';

import { autoParseUploadedProject, createProjectUpload } from '@/lib/projects/service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const project = await createProjectUpload({
      file,
      projectName: typeof formData.get('name') === 'string' ? (formData.get('name') as string) : null,
    });
    const parsed = await autoParseUploadedProject(project.id);

    return NextResponse.json({
      projectId: project.id,
      questionCount: parsed.questionCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    const status = message === 'No file uploaded' || message === 'Only .xlsx files are supported' || message === 'File too large'
      ? 400
      : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

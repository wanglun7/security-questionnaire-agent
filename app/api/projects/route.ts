import { NextRequest, NextResponse } from 'next/server';

import { createProjectUpload } from '@/lib/projects/service';

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

    return NextResponse.json({ projectId: project.id, status: project.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    const status = message === 'Only .xlsx files are supported' || message === 'File too large' ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

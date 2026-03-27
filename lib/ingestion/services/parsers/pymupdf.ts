import path from 'node:path';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function resolveProjectRoot() {
  const candidates = [
    path.resolve(__dirname, '../../../../'),
    path.resolve(__dirname, '../../../../../'),
    process.cwd(),
  ];

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'scripts', 'pymupdf_extract.py'));
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('Unable to locate scripts/pymupdf_extract.py');
}

export type PdfLayoutBlock = {
  page: number;
  blockIndex: number;
  text: string;
  bbox: [number, number, number, number];
  maxFontSize: number;
  minFontSize: number;
  fontNames: string[];
  allBold: boolean;
  boldRatio: number;
};

export type PdfLayoutResult = {
  pageCount: number;
  medianRegularFontSize: number;
  blocks: PdfLayoutBlock[];
  previewText: string;
};

async function resolvePythonExecutable() {
  const projectRoot = await resolveProjectRoot();
  const explicit = process.env.PYMUPDF_PYTHON_BIN;
  if (explicit) {
    return explicit;
  }

  const candidates = [
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'bin', 'python3'),
    'python3',
  ];

  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep)) {
        await access(candidate);
      }
      return candidate;
    } catch {
      continue;
    }
  }

  return 'python3';
}

export async function extractPdfLayoutWithPyMuPdf(sourceUri: string): Promise<PdfLayoutResult> {
  const projectRoot = await resolveProjectRoot();
  const pythonExecutable = await resolvePythonExecutable();
  const scriptPath = path.join(projectRoot, 'scripts', 'pymupdf_extract.py');
  const { stdout } = await execFileAsync(
    pythonExecutable,
    [scriptPath, path.resolve(sourceUri)],
    {
      cwd: projectRoot,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    }
  );

  return JSON.parse(stdout) as PdfLayoutResult;
}

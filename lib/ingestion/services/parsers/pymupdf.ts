import path from 'node:path';
import { access } from 'node:fs/promises';
import fs from 'node:fs';
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
    ...discoverWorktreePythonCandidates(projectRoot),
    'python3',
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep)) {
        await access(candidate);
      }

      if (await pythonSupportsPyMuPdf(candidate, projectRoot)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return 'python3';
}

function discoverWorktreePythonCandidates(projectRoot: string) {
  const worktreesDir = path.join(projectRoot, '.worktrees');
  if (!fs.existsSync(worktreesDir)) {
    return [];
  }

  return fs
    .readdirSync(worktreesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => [
      path.join(worktreesDir, entry.name, '.venv', 'bin', 'python'),
      path.join(worktreesDir, entry.name, '.venv', 'bin', 'python3'),
    ]);
}

async function pythonSupportsPyMuPdf(executable: string, cwd: string) {
  try {
    await execFileAsync(
      executable,
      ['-c', 'import fitz'],
      {
        cwd,
        env: process.env,
        maxBuffer: 1024 * 1024,
      }
    );
    return true;
  } catch {
    return false;
  }
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

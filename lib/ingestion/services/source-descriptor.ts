import fs from 'node:fs/promises';

import { load } from 'cheerio';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import { extractPdfLayoutWithPyMuPdf } from './parsers/pymupdf';
import { isPdfMetadataBoilerplate } from './parsers/pdf';
import { resolveEffectiveSheetRange } from './parsers/xlsx';

function collectHtmlPreviewText(html: string) {
  const $ = load(html);
  const lines: string[] = [];

  $('h1, h2, h3, dt, dd, p, li, th, td').each((_, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push(text);
    }
  });

  return lines.join('\n').slice(0, 2000);
}

async function extractDocxPreview(sourceUri: string) {
  const result = await mammoth.convertToHtml({ path: sourceUri });
  return collectHtmlPreviewText(result.value);
}

function extractXlsxPreview(sourceUri: string) {
  const workbook = XLSX.readFile(sourceUri);
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames.slice(0, 2)) {
    lines.push(`Sheet: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];
    const effectiveRange = resolveEffectiveSheetRange(sheet);

    if (!effectiveRange) {
      continue;
    }

    const range = XLSX.utils.decode_range(effectiveRange);

    for (let rowIndex = range.s.r; rowIndex <= Math.min(range.e.r, range.s.r + 5); rowIndex += 1) {
      const row: Array<string | number | boolean | null> = [];

      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
        row.push(cell?.w ?? cell?.v ?? null);
      }

      const text = row
        .map((cell) => `${cell ?? ''}`.trim())
        .filter(Boolean)
        .join(' | ');
      if (text) {
        lines.push(text);
      }
    }
  }

  return lines.join('\n').slice(0, 2000);
}

async function extractPdfPreview(sourceUri: string) {
  const layout = await extractPdfLayoutWithPyMuPdf(sourceUri);
  return layout.blocks
    .map((block) => block.text.replace(/\s+/g, ' ').trim())
    .filter((text) => text && !isPdfMetadataBoilerplate(text))
    .slice(0, 24)
    .join('\n')
    .slice(0, 2000);
}

export async function extractSourcePreviewText(input: {
  sourceUri: string;
  mimeType: string;
  originalFilename: string;
}) {
  try {
    const lowercaseName = input.originalFilename.toLowerCase();
    const mimeType = input.mimeType.toLowerCase();

    if (mimeType.includes('html') || lowercaseName.endsWith('.html') || lowercaseName.endsWith('.htm')) {
      const html = await fs.readFile(input.sourceUri, 'utf8');
      return collectHtmlPreviewText(html);
    }

    if (mimeType.startsWith('text/')) {
      const content = await fs.readFile(input.sourceUri, 'utf8');
      return content.slice(0, 2000);
    }

    if (mimeType.includes('wordprocessingml') || lowercaseName.endsWith('.docx')) {
      return extractDocxPreview(input.sourceUri);
    }

    if (mimeType.includes('spreadsheet') || lowercaseName.endsWith('.xlsx')) {
      return extractXlsxPreview(input.sourceUri);
    }

    if (mimeType.includes('pdf') || lowercaseName.endsWith('.pdf')) {
      return extractPdfPreview(input.sourceUri);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

import * as XLSX from 'xlsx';
import { buildPreviewRows, extractQuestionsFromRows, type ParsedQuestion } from '../questionnaire/extraction';

export interface WorkbookPreview {
  sheetNames: string[];
  preview: unknown[][];
}

export function previewExcel(filePath: string, sheetIndex: number = 0): WorkbookPreview {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const targetSheetName = sheetNames[sheetIndex];
  const sheet = workbook.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  return {
    sheetNames,
    preview: buildPreviewRows(rows),
  };
}

export function parseExcel(
  filePath: string,
  options: { sheetIndex?: number; columnIndex?: number } = {}
): ParsedQuestion[] {
  const workbook = XLSX.readFile(filePath);
  const sheetIndex = options.sheetIndex ?? 0;
  const columnIndex = options.columnIndex ?? 0;
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  return extractQuestionsFromRows({
    rows,
    sheetName,
    columnIndex,
  });
}

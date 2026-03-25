export interface ParsedQuestion {
  text: string;
  orderNum: number;
  sourceSheetName: string;
  sourceRowNum: number;
}

export interface ExtractQuestionsInput {
  rows: unknown[][];
  sheetName: string;
  columnIndex: number;
}

export function buildPreviewRows(rows: unknown[][], limit: number = 20): unknown[][] {
  return rows.slice(0, limit);
}

export function isNonQuestion(text: string): boolean {
  const normalized = text.trim();

  if (!normalized) {
    return true;
  }

  return /^[\d.\-()]+$/.test(normalized) ||
    /^第[一二三四五六七八九十\d]+[章节条篇部分]/.test(normalized) ||
    /^(是|否|N\/A|Yes|No)$/i.test(normalized);
}

export function extractQuestionsFromRows({
  rows,
  sheetName,
  columnIndex,
}: ExtractQuestionsInput): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let orderNum = 1;

  rows.forEach((row, rowIndex) => {
    const rawValue = row[columnIndex];
    const text = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();

    if (rowIndex === 0 || text.length <= 5 || isNonQuestion(text)) {
      return;
    }

    questions.push({
      text,
      orderNum: orderNum++,
      sourceSheetName: sheetName,
      sourceRowNum: rowIndex + 1,
    });
  });

  return questions;
}

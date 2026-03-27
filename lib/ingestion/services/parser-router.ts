export type ParserStrategy = 'pdf' | 'docx' | 'xlsx' | 'html';

export function resolveParserStrategy(input: {
  mimeType: string;
  originalFilename: string;
}): ParserStrategy {
  const mimeType = input.mimeType.toLowerCase();
  const filename = input.originalFilename.toLowerCase();

  if (
    mimeType.includes('spreadsheet') ||
    filename.endsWith('.xlsx')
  ) {
    return 'xlsx';
  }

  if (
    mimeType.includes('wordprocessingml') ||
    filename.endsWith('.docx')
  ) {
    return 'docx';
  }

  if (
    mimeType.includes('html') ||
    filename.endsWith('.html') ||
    filename.endsWith('.htm')
  ) {
    return 'html';
  }

  return 'pdf';
}

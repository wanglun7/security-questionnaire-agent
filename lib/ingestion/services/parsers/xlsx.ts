import { randomUUID } from 'node:crypto';

import XLSX from 'xlsx';

import type { ChunkContract } from '../../contracts/chunk';
import type { DocumentContract } from '../../contracts/document';
import type { SectionContract } from '../../contracts/section';
import { computeChunkChecksum } from '../diffing';
import { isMeaningfulRow } from '../chunking';

export const XLSX_ROW_BATCH_SIZE = 1000;
const XLSX_HEAD_SAMPLE_LIMIT = 200;
const XLSX_PERIODIC_SAMPLE_EVERY = 1000;
const XLSX_PERIODIC_SAMPLE_LIMIT = 250;
const XLSX_TAIL_SAMPLE_LIMIT = 50;

const workbookCache = new Map<string, XLSX.WorkBook>();

type XlsxRowEntry = {
  sheetName: string;
  rowNumber: number;
  text: string;
};

export type XlsxRowBatchDescriptor = {
  batchIndex: number;
  sheetName: string;
  rowStart: number;
  rowEnd: number;
  nonEmptyRowCount: number;
};

export type XlsxRowBatchPlan = {
  batchSize: number;
  totalRows: number;
  totalBatches: number;
  batches: XlsxRowBatchDescriptor[];
};

export type ParsedDocumentResult = {
  document: DocumentContract;
  sections: SectionContract[];
  rowBatchPlan?: XlsxRowBatchPlan;
};

function getWorkbook(sourceUri: string) {
  const cached = workbookCache.get(sourceUri);
  if (cached) {
    return cached;
  }

  const workbook = XLSX.readFile(sourceUri);
  workbookCache.set(sourceUri, workbook);
  return workbook;
}

export function resolveEffectiveSheetRange(sheet: XLSX.WorkSheet) {
  const cellRefs = Object.keys(sheet).filter((key) => !key.startsWith('!'));
  if (cellRefs.length === 0) {
    return sheet['!ref'];
  }

  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = 0;

  for (const ref of cellRefs) {
    const decoded = XLSX.utils.decode_cell(ref);
    minRow = Math.min(minRow, decoded.r);
    maxRow = Math.max(maxRow, decoded.r);
    minCol = Math.min(minCol, decoded.c);
    maxCol = Math.max(maxCol, decoded.c);
  }

  return XLSX.utils.encode_range({
    s: { r: Number.isFinite(minRow) ? minRow : 0, c: Number.isFinite(minCol) ? minCol : 0 },
    e: { r: maxRow, c: maxCol },
  });
}

function normalizeRowText(row: Array<string | number | boolean | null>) {
  return row
    .map((cell) => `${cell ?? ''}`.trim())
    .filter(Boolean)
    .join(' | ');
}

function readSheetRowText(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  columnStart: number,
  columnEnd: number
) {
  const row: Array<string | number | boolean | null> = [];

  for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
    row.push(cell?.w ?? cell?.v ?? null);
  }

  return normalizeRowText(row);
}

function createRowSection(documentId: string, row: XlsxRowEntry): SectionContract {
  return {
    sectionId: randomUUID(),
    documentId,
    kind: 'row_block',
    textRef: row.text,
    span: {
      sheetName: row.sheetName,
      rowStart: row.rowNumber,
      rowEnd: row.rowNumber,
    },
  };
}

function createRowChunk(documentId: string, row: XlsxRowEntry): ChunkContract {
  return {
    chunkId: randomUUID(),
    documentId,
    tenant: 'default',
    rawTextRef: row.text,
    cleanText: row.text,
    aclTags: [],
    checksum: computeChunkChecksum({ cleanText: row.text }),
    reviewStatus: 'pending',
    indexStatus: 'pending',
    chunkStrategy: 'row',
    span: {
      sheetName: row.sheetName,
      rowStart: row.rowNumber,
      rowEnd: row.rowNumber,
    },
    metadataVersion: 1,
  };
}

function dedupeRows(rows: XlsxRowEntry[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.sheetName}:${row.rowNumber}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function scanWorkbook({
  sourceUri,
  batchSize = XLSX_ROW_BATCH_SIZE,
}: {
  sourceUri: string;
  batchSize?: number;
}) {
  const workbook = getWorkbook(sourceUri);
  const sampleRows: XlsxRowEntry[] = [];
  const tailRows: XlsxRowEntry[] = [];
  const batches: XlsxRowBatchDescriptor[] = [];

  let totalRows = 0;
  let periodicSampleCount = 0;
  let batchIndex = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const effectiveRange = resolveEffectiveSheetRange(sheet);

    if (!effectiveRange) {
      continue;
    }

    const range = XLSX.utils.decode_range(effectiveRange);
    let batchRowStart: number | undefined;
    let batchRowEnd: number | undefined;
    let batchNonEmptyRowCount = 0;

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const text = readSheetRowText(sheet, rowIndex, range.s.c, range.e.c);
      if (!text) {
        continue;
      }

      const row = {
        sheetName,
        rowNumber: rowIndex + 1,
        text,
      };

      totalRows += 1;

      if (totalRows <= XLSX_HEAD_SAMPLE_LIMIT) {
        sampleRows.push(row);
      } else if (
        totalRows % XLSX_PERIODIC_SAMPLE_EVERY === 0 &&
        periodicSampleCount < XLSX_PERIODIC_SAMPLE_LIMIT
      ) {
        sampleRows.push(row);
        periodicSampleCount += 1;
      }

      tailRows.push(row);
      if (tailRows.length > XLSX_TAIL_SAMPLE_LIMIT) {
        tailRows.shift();
      }

      if (batchRowStart === undefined) {
        batchRowStart = row.rowNumber;
      }
      batchRowEnd = row.rowNumber;
      batchNonEmptyRowCount += 1;

      if (batchNonEmptyRowCount === batchSize) {
        batches.push({
          batchIndex,
          sheetName,
          rowStart: batchRowStart,
          rowEnd: batchRowEnd,
          nonEmptyRowCount: batchNonEmptyRowCount,
        });
        batchIndex += 1;
        batchRowStart = undefined;
        batchRowEnd = undefined;
        batchNonEmptyRowCount = 0;
      }
    }

    if (
      batchRowStart !== undefined &&
      batchRowEnd !== undefined &&
      batchNonEmptyRowCount > 0
    ) {
      batches.push({
        batchIndex,
        sheetName,
        rowStart: batchRowStart,
        rowEnd: batchRowEnd,
        nonEmptyRowCount: batchNonEmptyRowCount,
      });
      batchIndex += 1;
    }
  }

  return {
    totalRows,
    sampledRows: dedupeRows([...sampleRows, ...tailRows]),
    rowBatchPlan: {
      batchSize,
      totalRows,
      totalBatches: batches.length,
      batches,
    } satisfies XlsxRowBatchPlan,
  };
}

export async function loadXlsxRowChunkBatch({
  documentId,
  sourceUri,
  batch,
}: {
  documentId: string;
  sourceUri: string;
  batch: XlsxRowBatchDescriptor;
}): Promise<ChunkContract[]> {
  const workbook = getWorkbook(sourceUri);
  const sheet = workbook.Sheets[batch.sheetName];
  const effectiveRange = resolveEffectiveSheetRange(sheet);

  if (!effectiveRange) {
    return [];
  }

  const range = XLSX.utils.decode_range(effectiveRange);
  const rowStart = Math.max(batch.rowStart - 1, range.s.r);
  const rowEnd = Math.min(batch.rowEnd - 1, range.e.r);
  const chunks: ChunkContract[] = [];

  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const text = readSheetRowText(sheet, rowIndex, range.s.c, range.e.c);
    if (!text) {
      continue;
    }

    const row = {
      sheetName: batch.sheetName,
      rowNumber: rowIndex + 1,
      text,
    };
    const section = createRowSection(documentId, row);

    if (!isMeaningfulRow(section)) {
      continue;
    }

    chunks.push(createRowChunk(documentId, row));
  }

  return chunks;
}

export async function parseXlsxDocument({
  documentId,
  sourceUri,
}: {
  documentId: string;
  sourceUri: string;
}): Promise<ParsedDocumentResult> {
  const scanResult = scanWorkbook({ sourceUri });

  return {
    document: {
      documentId,
      sourceUri,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      docType: 'questionnaire',
      sectionCount: scanResult.totalRows,
    },
    sections: scanResult.sampledRows.map((row) => createRowSection(documentId, row)),
    rowBatchPlan: scanResult.rowBatchPlan,
  };
}

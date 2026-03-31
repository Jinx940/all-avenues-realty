export type CsvValue = string | number | boolean | null | undefined;

type CsvBuildOptions = {
  delimiter?: string;
  includeExcelSeparatorHint?: boolean;
  numericPrecision?: number;
};

const normalizeCsvValue = (value: CsvValue, numericPrecision: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** numericPrecision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const escapeCsvValue = (
  value: CsvValue,
  delimiter: string,
  numericPrecision: number,
) => {
  const normalized = normalizeCsvValue(value, numericPrecision);
  const text = normalized == null ? '' : String(normalized);
  const escaped = text.replace(/"/g, '""');
  const shouldQuote =
    escaped.includes(delimiter) ||
    escaped.includes('"') ||
    escaped.includes('\r') ||
    escaped.includes('\n');
  return shouldQuote ? `"${escaped}"` : escaped;
};

export const buildCsv = (rows: CsvValue[][], options: CsvBuildOptions = {}) => {
  const delimiter = options.delimiter ?? ',';
  const numericPrecision = options.numericPrecision ?? 2;
  return rows
    .map((row) => row.map((value) => escapeCsvValue(value, delimiter, numericPrecision)).join(delimiter))
    .join('\r\n');
};

export const buildExcelCsv = (rows: CsvValue[][], options: CsvBuildOptions = {}) => {
  const delimiter = options.delimiter ?? ',';
  const csv = buildCsv(rows, options);

  if (options.includeExcelSeparatorHint === false) {
    return csv;
  }

  return `sep=${delimiter}\r\n${csv}`;
};

export const downloadCsv = (fileName: string, rows: CsvValue[][], options: CsvBuildOptions = {}) => {
  const csv = `\uFEFF${buildExcelCsv(rows, options)}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

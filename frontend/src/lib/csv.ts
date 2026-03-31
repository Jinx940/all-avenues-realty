export type CsvValue = string | number | boolean | null | undefined;

const escapeCsvValue = (value: CsvValue) => {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

export const buildCsv = (rows: CsvValue[][]) =>
  rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');

export const downloadCsv = (fileName: string, rows: CsvValue[][]) => {
  const csv = `\uFEFF${buildCsv(rows)}`;
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

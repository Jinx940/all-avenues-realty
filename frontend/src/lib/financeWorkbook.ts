import { requestBlob } from './api';

export type FinanceWorkbookValueFormat = 'text' | 'integer' | 'currency' | 'percent';

export type FinanceWorkbookMetaRow = {
  label: string;
  value: string | number;
  format?: FinanceWorkbookValueFormat;
};

export type FinanceWorkbookMetricRow = {
  metric: string;
  value: number;
  format: Exclude<FinanceWorkbookValueFormat, 'text'>;
};

export type FinanceWorkbookSection = {
  title: string;
  rows: FinanceWorkbookMetricRow[];
};

export type FinanceWorkbookInput = {
  fileName: string;
  title: string;
  meta: FinanceWorkbookMetaRow[];
  sections: FinanceWorkbookSection[];
};

const downloadBlob = (fileName: string, blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

export const downloadFinanceWorkbook = async (input: FinanceWorkbookInput) => {
  const blob = await requestBlob('/api/exports/finance-workbook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  downloadBlob(input.fileName, blob);
};

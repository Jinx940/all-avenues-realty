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

export const financeWorkbookMimeType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const palette = {
  titleFill: '1F4E78',
  sectionFill: 'D9EAD3',
  headerFill: 'DDEBF7',
  labelFill: 'EAF2F8',
  rowFill: 'FFFFFF',
  alternateRowFill: 'F8FBFE',
  border: 'B7C9D6',
  text: '16324F',
  white: 'FFFFFF',
};

const applyBorder = (cell: {
  border: unknown;
}) => {
  cell.border = {
    top: { style: 'thin', color: { argb: palette.border } },
    left: { style: 'thin', color: { argb: palette.border } },
    bottom: { style: 'thin', color: { argb: palette.border } },
    right: { style: 'thin', color: { argb: palette.border } },
  };
};

const applyFill = (cell: { fill: unknown }, color: string) => {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: color },
  };
};

const applyValueFormat = (
  cell: {
    numFmt?: string;
    value: unknown;
  },
  value: string | number,
  format: FinanceWorkbookValueFormat = 'text',
) => {
  if (format === 'percent' && typeof value === 'number') {
    cell.value = value / 100;
    cell.numFmt = '0%';
    return;
  }

  cell.value = value;

  if (format === 'currency') {
    cell.numFmt = '$#,##0.00';
    return;
  }

  if (format === 'integer') {
    cell.numFmt = '0';
  }
};

export const normalizeFinanceWorkbookFileName = (value: string) => {
  const trimmed = value.trim() || 'finance-summary.xlsx';
  const withExtension = /\.xlsx$/i.test(trimmed) ? trimmed : `${trimmed}.xlsx`;
  return Array.from(withExtension)
    .map((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint <= 31 || '<>:"/\\|?*'.includes(character) ? '-' : character;
    })
    .join('');
};

export const buildFinanceWorkbookBuffer = async (input: FinanceWorkbookInput) => {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'All Avenues Realty';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Finance Summary', {
    views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
  });

  sheet.columns = [
    { width: 28 },
    { width: 18 },
  ];

  sheet.mergeCells('A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = input.title;
  titleCell.font = { bold: true, size: 15, color: { argb: palette.white } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  applyFill(titleCell, palette.titleFill);
  applyBorder(titleCell);
  sheet.getRow(1).height = 26;

  let rowIndex = 3;

  input.meta.forEach((item) => {
    const row = sheet.getRow(rowIndex);
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);

    labelCell.value = item.label;
    labelCell.font = { bold: true, color: { argb: palette.text } };
    applyFill(labelCell, palette.labelFill);
    applyBorder(labelCell);

    applyValueFormat(valueCell, item.value, item.format);
    valueCell.font = { color: { argb: palette.text } };
    valueCell.alignment = {
      vertical: 'middle',
      horizontal: typeof item.value === 'number' ? 'right' : 'left',
    };
    applyBorder(valueCell);

    row.height = 20;
    rowIndex += 1;
  });

  rowIndex += 1;

  input.sections.forEach((section) => {
    sheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
    const sectionCell = sheet.getCell(`A${rowIndex}`);
    sectionCell.value = section.title;
    sectionCell.font = { bold: true, color: { argb: palette.text } };
    sectionCell.alignment = { vertical: 'middle', horizontal: 'left' };
    applyFill(sectionCell, palette.sectionFill);
    applyBorder(sectionCell);
    sheet.getRow(rowIndex).height = 22;
    rowIndex += 1;

    const headerRow = sheet.getRow(rowIndex);
    const metricHeader = headerRow.getCell(1);
    const valueHeader = headerRow.getCell(2);
    metricHeader.value = 'Metric';
    valueHeader.value = 'Value';

    [metricHeader, valueHeader].forEach((cell) => {
      cell.font = { bold: true, color: { argb: palette.text } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      applyFill(cell, palette.headerFill);
      applyBorder(cell);
    });

    headerRow.height = 20;
    rowIndex += 1;

    section.rows.forEach((item, index) => {
      const row = sheet.getRow(rowIndex);
      const metricCell = row.getCell(1);
      const valueCell = row.getCell(2);
      const fillColor = index % 2 === 0 ? palette.rowFill : palette.alternateRowFill;

      metricCell.value = item.metric;
      metricCell.font = { color: { argb: palette.text } };
      metricCell.alignment = { vertical: 'middle', horizontal: 'left' };
      applyFill(metricCell, fillColor);
      applyBorder(metricCell);

      applyValueFormat(valueCell, item.value, item.format);
      valueCell.font = {
        bold: item.format === 'currency' || item.format === 'percent',
        color: { argb: palette.text },
      };
      valueCell.alignment = { vertical: 'middle', horizontal: 'right' };
      applyFill(valueCell, fillColor);
      applyBorder(valueCell);

      row.height = 19;
      rowIndex += 1;
    });

    rowIndex += 1;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
};

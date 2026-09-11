import { formatMoney } from './format';

type CrystalItem = { unit: string; area: string; service: string; description: string; labor: number; unitPrice: number };
export type CrystalInvoiceData = {
  documentType: 'Invoice' | 'Quote';
  invoiceNumber: string;
  docDate: string;
  billTo: string;
  propertyName: string;
  propertyAddress: string;
  propertyCityLine: string;
  selectedItems: CrystalItem[];
  jobTotal: number;
  materialExpense: number;
  advancePayment: number;
  totalDue: number;
  attachments: { url: string; kind: string; label: string; fileName: string }[];
};

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const dateLabel = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date) : '';
};

// Bound each continuation row so even a single long description can span pages.
export function crystalDescriptionChunks(text: string): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    let remaining = paragraph;
    while (remaining.length > 240) {
      const boundary = remaining.lastIndexOf(' ', 240);
      const split = boundary > 120 ? boundary : 240;
      chunks.push(remaining.slice(0, split));
      remaining = remaining.slice(split).trimStart();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks.length ? chunks : [''];
}

const styles = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e9e8e6; color: #363735; font-family: Arial, sans-serif; }
.page { width: 210mm; height: 297mm; padding: 42px; margin: 0 auto 18px; position: relative; overflow: hidden; background: #fcfcfa; color: #363735; font-family: Arial, sans-serif; font-size: 10px; line-height: 1.4; font-weight: 400; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.cs-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
.cs-brand { border-left: 7px double #c8c3bd; padding: 8px 0 8px 18px; }
.cs-brand strong { display: block; font-size: 18px; letter-spacing: 2px; font-weight: 500; }
.cs-brand small { display: block; margin-top: 9px; font-size: 9px; letter-spacing: 2px; color: #777871; }
.cs-title { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 58px; line-height: 1; letter-spacing: -2px; margin: 0; text-transform: uppercase; }
.cs-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin: 0 0 24px; }
.cs-meta h2 { margin: 0 0 9px; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; color: #85857d; }
.cs-meta p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; line-height: 1.6; }
.cs-meta dl { display: grid; gap: 7px; margin: 0; }
.cs-meta dl > div { display: flex; gap: 12px; font-size: 10px; }
.cs-meta dt { width: 55px; flex-shrink: 0; color: #85857d; }
.cs-meta dd { margin: 0; overflow-wrap: anywhere; }
.cs-property { display: flex; gap: 12px; align-items: baseline; border-top: 1px solid #dedbd6; padding: 12px 0; font-size: 10px; margin-bottom: 8px; }
.cs-property > span { font-size: 9px; letter-spacing: 1px; color: #85857d; text-transform: uppercase; }
.cs-property strong { font-weight: 500; overflow-wrap: anywhere; }
.cs-table { width: 100%; table-layout: fixed; border-collapse: collapse; flex-shrink: 0; }
.cs-table th { padding: 13px 7px; background: #edeae6; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; text-align: left; }
.cs-table th:nth-child(3) { background: #d6d0c9; }
.cs-table td { vertical-align: top; padding: 4px 7px; font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
.cs-table .cs-merged { padding: 8px 7px; border-bottom: 1px solid #e9e6e1; }
.cs-table .cs-level-0, .cs-table .cs-level-1 { background: #f3f3f0; text-align: center; vertical-align: middle; }
.cs-table .cs-item-end td { padding-bottom: 8px; border-bottom: 1px solid #e9e6e1; }
.cs-table .cs-item-shaded td { background: #f3f3f0; }
.cs-table td strong { display: block; font-weight: 600; margin-bottom: 2px; }
.cs-description { white-space: normal; margin: 0; font-size: 10px; line-height: 1.4; }
.cs-table .cs-money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 9px; }
.cs-table td.cs-money:empty { padding-top: 0; padding-bottom: 0; }
.cs-cont { font-size: 8px; color: #8e8d87; font-weight: 400; }
.cs-bottom { display: flex; gap: 28px; justify-content: space-between; align-items: flex-end; padding-top: 20px; margin-top: 0; }
.cs-thanks { flex: 1; }
.cs-thanks p { font-family: Georgia, serif; font-size: 23px; font-weight: 400; line-height: 1.5; color: #70716a; margin: 0 0 24px; }
.cs-thanks strong { display: block; width: fit-content; padding-top: 8px; border-top: 1px solid #96968e; font-size: 11px; font-weight: 500; letter-spacing: 1px; }
.cs-thanks small { display: block; margin-top: 5px; font-size: 8px; color: #8b8b82; letter-spacing: 1px; }
.cs-summary { width: 290px; flex-shrink: 0; }
.cs-summary dl { display: grid; gap: 10px; margin: 0 10px 16px; }
.cs-summary dl > div { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; }
.cs-summary dt { color: #76776f; }
.cs-summary dd { margin: 0; font-variant-numeric: tabular-nums; }
.cs-total { display: flex; justify-content: space-between; align-items: center; gap: 10px; background: #d6d0c9; padding: 20px 15px; border-left: 8px solid #c7c0b7; }
.cs-total span { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
.cs-total strong { font-size: 19px; font-weight: 500; white-space: nowrap; }
.cs-continuation { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 25px; border-bottom: 1px solid #dedbd6; padding-bottom: 20px; }
.cs-continuation strong { font-size: 15px; font-weight: 400; letter-spacing: 1.5px; }
.cs-continuation span { font-size: 11px; color: #85857d; }
.cs-evidence { display: grid; gap: 22px; }
.attachment-card { margin: 0; border: 1px solid #dedbd6; }
.attachment-card img { display: block; width: 100%; height: 350px; object-fit: contain; background: #f3f3f0; }
.attachment-card figcaption { padding: 12px; font-size: 10px; color: #6c6d64; }
@page { size: A4; margin: 0; }
@media print { html, body { background: white; } .page { margin: 0; } }
`;

export function buildCrystalInvoiceHtml(data: CrystalInvoiceData): string {
  const invoice = data.documentType === 'Invoice';
  // Gather repeated locations even when the source lists services across rooms.
  // Preserve first-seen group order and keep each item's amounts with that item.
  const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const units = new Map<string, Map<string, Map<string, CrystalItem[]>>>();
  for (const item of data.selectedItems) {
    const unit = normalized(item.unit), area = normalized(item.area), service = normalized(item.service);
    if (!units.has(unit)) units.set(unit, new Map());
    const areas = units.get(unit)!;
    if (!areas.has(area)) areas.set(area, new Map());
    const services = areas.get(area)!;
    if (!services.has(service)) services.set(service, []);
    services.get(service)!.push(item);
  }
  const groupedItems = [...units.values()].flatMap((areas) => [...areas.values()].flatMap((services) => [...services.values()].flat()));
  const rows = groupedItems.flatMap((item) =>
    crystalDescriptionChunks(item.description).map((description, chunkIndex) => ({ item, description, chunkIndex })));
  type Row = typeof rows[number];
  const key = (row: Row, level: number) => JSON.stringify([normalized(row.item.unit), ...(level > 0 ? [normalized(row.item.area)] : []), ...(level > 1 ? [normalized(row.item.service)] : [])]);
  const renderRows = (page: Row[]) => page.map((row, index) => {
    const cells = [0, 1, 2].map((level) => {
      if (index && key(page[index - 1], level) === key(row, level)) return '';
      let end = index + 1;
      while (end < page.length && key(page[end], level) === key(row, level)) end++;
      const content = level === 0 ? escape(row.item.unit || '-') : level === 1 ? escape(row.item.area || '-')
        : '<strong>' + escape(row.item.service) + '</strong><p class="cs-description">' + escape(page.slice(index, end).map((part) => part.description).join(' ')) + '</p>';
      return '<td class="cs-merged cs-level-' + level + '" rowspan="' + (end - index) + '">' + content + '</td>';
    }).join('');
    const amount = (value: number) => '<td class="cs-money">' + (row.chunkIndex === 0 ? formatMoney(value) : '') + '</td>';
    return '<tr>' + cells + (invoice ? amount(row.item.labor) : '<td class="cs-money"></td>') + amount(row.item.unitPrice) + amount(row.item.unitPrice + (invoice ? row.item.labor : 0)) + '</tr>';
  }).join('');
  const columns = '<colgroup><col style="width:8%"><col style="width:11%"><col style="width:42%"><col style="width:13%"><col style="width:13%"><col style="width:13%"></colgroup>';
  const head = '<thead><tr><th>Unit</th><th>Work</th><th>Services &amp; description</th><th class="cs-money">Labor</th><th class="cs-money">' + (invoice ? 'Materials' : 'Price') + '</th><th class="cs-money">Amount</th></tr></thead>';
  const continuation = (label: string) => `<header class="cs-continuation"><strong>CRYSTAL SARICH</strong><span>${escape(data.documentType)} ${escape(data.invoiceNumber)} / ${label}</span></header>`;
  const summary = `<section class="cs-bottom"><div class="cs-thanks"><p>Thank you for<br>trusting us.</p><strong>Crystal Sarich</strong><small>${invoice ? 'INVOICE ISSUED BY' : 'ESTIMATE PREPARED BY'}</small></div><div class="cs-summary"><dl><div><dt>Subtotal</dt><dd>${formatMoney(data.jobTotal)}</dd></div>${data.materialExpense ? `<div><dt>Material expense</dt><dd>-${formatMoney(data.materialExpense)}</dd></div>` : ''}${data.advancePayment ? `<div><dt>Advance payment</dt><dd>-${formatMoney(data.advancePayment)}</dd></div>` : ''}</dl><div class="cs-total"><span>${invoice ? 'Total due' : 'Total'}</span><strong>${formatMoney(data.totalDue)}</strong></div></div></section>`;
  const firstHeader = `<header class="cs-header"><div class="cs-brand"><strong>CRYSTAL SARICH</strong><small>ALL AVENUES REALTY</small></div><h1 class="cs-title">${data.documentType}</h1></header><section class="cs-meta"><div><h2>Billing to</h2><p>${escape(data.billTo.trim() || 'Recipient not specified')}</p></div><dl><div><dt>${data.documentType}</dt><dd>${escape(data.invoiceNumber)}</dd></div><div><dt>Date</dt><dd>${escape(dateLabel(data.docDate))}</dd></div><div><dt>Currency</dt><dd>USD - US Dollar</dd></div></dl></section><div class="cs-property"><span>Property</span><strong>${escape([data.propertyName, data.propertyAddress !== data.propertyName ? data.propertyAddress : '', data.propertyCityLine].filter(Boolean).join(' / '))}</strong></div>`;
  const pageHtml = (page: Row[], index: number, final: boolean) => '<section class="page crystal-invoice-page">' + (index === 0 ? firstHeader : continuation('Continued')) + '<table class="cs-table">' + columns + (index === 0 ? head : '') + '<tbody>' + renderRows(page) + '</tbody></table>' + (final ? summary : '') + '</section>';
  // Measure the actual merged table: rowspans change row heights, so measuring
  // unmerged rows can clip descriptions or leave unnecessary page gaps.
  const pages: Row[][] = [[]];
  let host: HTMLDivElement | undefined;
  let shadow: ShadowRoot | undefined;
  if (typeof document !== 'undefined') {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;width:794px;';
    shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  }
  const fits = (page: Row[], index: number, final: boolean) => {
    if (!shadow) return page.reduce((sum, row) => sum + 12 + Math.ceil((row.description.length + row.item.service.length) / 40) * 14, 0) + (final ? 190 : 0) <= (index === 0 ? 720 : 950);
    shadow.innerHTML = '<style>' + styles + '</style>' + pageHtml(page, index, final);
    const element = shadow.querySelector('.page')!;
    const bottom = element.getBoundingClientRect().bottom - 42;
    return [...element.querySelectorAll('.cs-table, .cs-bottom')].every((block) => block.getBoundingClientRect().bottom <= bottom - 2);
  };
  try {
    rows.forEach((row, index) => {
      let current = pages.at(-1)!;
      if (!fits([...current, row], pages.length - 1, false)) {
        pages.push([]);
        current = pages.at(-1)!;
      }
      current.push(row);
      if (index === rows.length - 1 && !fits(current, pages.length - 1, true)) {
        // Keep the final row with totals when both fit on a continuation page.
        if (current.length > 1 && fits([row], pages.length, true)) {
          current.pop();
          pages.push([row]);
        } else pages.push([]);
      }
    });
  } finally { host?.remove(); }
  const attachmentPages = Array.from({ length: Math.ceil(data.attachments.length / 2) }, (_, index) => data.attachments.slice(index * 2, index * 2 + 2));
  const content = pages.map((page, index) => pageHtml(page, index, index === pages.length - 1)).join('');
  const evidence = attachmentPages.map((files) => '<section class="page crystal-invoice-page attachment-page">' + continuation('Files and pictures') + '<div class="cs-evidence">' + files.map((file) => '<figure class="attachment-card"><img src="' + escape(file.url) + '" alt="' + escape(file.fileName) + '"><figcaption>' + escape(file.kind === 'before' ? 'Before' : 'After') + ' / ' + escape(file.label) + '</figcaption></figure>').join('') + '</div></section>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${escape(data.documentType)} ${escape(data.invoiceNumber)} - Crystal Sarich</title><style>${styles}</style></head><body>${content}${evidence}</body></html>`;
}

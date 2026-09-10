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
.page { width: 210mm; height: 297mm; padding: 42px 42px 70px; margin: 0 auto 18px; position: relative; overflow: hidden; background: #fcfcfa; color: #363735; font-family: Arial, sans-serif; font-weight: 400; display: flex; flex-direction: column; page-break-after: always; }
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
.cs-table td { vertical-align: top; padding: 12px 7px; border-bottom: 1px solid #e9e6e1; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.cs-table tr:nth-child(even) td { background: #f3f3f0; }
.cs-table td strong { display: block; font-weight: 600; margin-bottom: 5px; }
.cs-description { white-space: pre-wrap; margin: 0; font-size: 10px; line-height: 1.5; }
.cs-table .cs-money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 9px; }
.cs-cont { font-size: 8px; color: #8e8d87; font-weight: 400; }
.cs-bottom { display: flex; gap: 28px; justify-content: space-between; align-items: flex-end; padding-top: 24px; margin-top: auto; flex-shrink: 0; }
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
.cs-footer { position: absolute; bottom: 24px; left: 42px; right: 42px; display: flex; justify-content: space-between; border-top: 1px solid #dedbd6; padding-top: 10px; color: #96968e; font-size: 8px; letter-spacing: 1px; }
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
  const rows = data.selectedItems.flatMap((item) => crystalDescriptionChunks(item.description).map((description, index) => {
    const title = index === 0 ? item.service : `${item.service} (continued)`;
    const html = `<tr><td>${escape(item.unit || '-')}</td><td>${escape(item.area || '-')}</td><td><strong>${escape(title)}</strong><p class="cs-description">${escape(description)}</p></td><td class="cs-money">${index === 0 && invoice ? formatMoney(item.labor) : ''}</td><td class="cs-money">${index === 0 ? formatMoney(item.unitPrice) : ''}</td><td class="cs-money">${index === 0 ? formatMoney(item.unitPrice + (invoice ? item.labor : 0)) : ''}</td></tr>`;
    return { html, estimate: 45 + Math.ceil((description.length + title.length) / 26) * 15 };
  }));
  const head = `<colgroup><col style="width:8%"><col style="width:11%"><col style="width:42%"><col style="width:13%"><col style="width:13%"><col style="width:13%"></colgroup><thead><tr><th>Unit</th><th>Work</th><th>Services &amp; description</th><th class="cs-money">Labor</th><th class="cs-money">${invoice ? 'Materials' : 'Price'}</th><th class="cs-money">Amount</th></tr></thead>`;
  // Measure using the same fixed A4 columns as the preview and PDF export.
  let heights = rows.map((row) => row.estimate);
  if (typeof document !== 'undefined') {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;width:794px;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${styles}</style><div class="page"><table class="cs-table">${head}<tbody>${rows.map((row) => row.html).join('')}</tbody></table></div>`;
    document.body.appendChild(host);
    try { heights = [...shadow.querySelectorAll('tbody tr')].map((row) => Math.ceil(row.getBoundingClientRect().height) + 2); }
    finally { host.remove(); }
  }
  const pages: string[][] = [[]];
  let height = 0;
  rows.forEach((row, index) => {
    const budget = pages.length === 1 ? 445 : 680;
    if (height + heights[index] > budget && pages.at(-1)!.length) { pages.push([]); height = 0; }
    pages.at(-1)!.push(row.html);
    height += heights[index];
  });
  const attachmentPages = Array.from({ length: Math.ceil(data.attachments.length / 2) }, (_, index) => data.attachments.slice(index * 2, index * 2 + 2));
  const pageCount = pages.length + attachmentPages.length;
  const footer = (index: number) => `<footer class="cs-footer"><span>CRYSTAL SARICH / ${escape(data.documentType.toUpperCase())} ${escape(data.invoiceNumber)}</span><span>${index + 1} / ${pageCount}</span></footer>`;
  const continuation = (label: string) => `<header class="cs-continuation"><strong>CRYSTAL SARICH</strong><span>${escape(data.documentType)} ${escape(data.invoiceNumber)} / ${label}</span></header>`;
  const summary = `<section class="cs-bottom"><div class="cs-thanks"><p>Thank you for<br>trusting us.</p><strong>Crystal Sarich</strong><small>${invoice ? 'INVOICE ISSUED BY' : 'ESTIMATE PREPARED BY'}</small></div><div class="cs-summary"><dl><div><dt>Subtotal</dt><dd>${formatMoney(data.jobTotal)}</dd></div>${data.materialExpense ? `<div><dt>Material expense</dt><dd>-${formatMoney(data.materialExpense)}</dd></div>` : ''}${data.advancePayment ? `<div><dt>Advance payment</dt><dd>-${formatMoney(data.advancePayment)}</dd></div>` : ''}</dl><div class="cs-total"><span>${invoice ? 'Total due' : 'Total'}</span><strong>${formatMoney(data.totalDue)}</strong></div></div></section>`;
  const firstHeader = `<header class="cs-header"><div class="cs-brand"><strong>CRYSTAL SARICH</strong><small>ALL AVENUES REALTY</small></div><h1 class="cs-title">${data.documentType}</h1></header><section class="cs-meta"><div><h2>Billing to</h2><p>${escape(data.billTo.trim() || 'Recipient not specified')}</p></div><dl><div><dt>${data.documentType}</dt><dd>${escape(data.invoiceNumber)}</dd></div><div><dt>Date</dt><dd>${escape(dateLabel(data.docDate))}</dd></div><div><dt>Currency</dt><dd>USD - US Dollar</dd></div></dl></section><div class="cs-property"><span>Property</span><strong>${escape([data.propertyName, data.propertyAddress !== data.propertyName ? data.propertyAddress : '', data.propertyCityLine].filter(Boolean).join(' / '))}</strong></div>`;
  const content = pages.map((page, index) => `<section class="page crystal-invoice-page">${index === 0 ? firstHeader : continuation('Continued')}<table class="cs-table">${head}<tbody>${page.join('')}</tbody></table>${index === pages.length - 1 ? summary : ''}${footer(index)}</section>`).join('');
  const evidence = attachmentPages.map((files, index) => `<section class="page crystal-invoice-page attachment-page">${continuation('Files and pictures')}<div class="cs-evidence">${files.map((file) => `<figure class="attachment-card"><img src="${escape(file.url)}" alt="${escape(file.fileName)}"><figcaption>${escape(file.kind === 'before' ? 'Before' : 'After')} / ${escape(file.label)}</figcaption></figure>`).join('')}</div>${footer(pages.length + index)}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${escape(data.documentType)} ${escape(data.invoiceNumber)} - Crystal Sarich</title><style>${styles}</style></head><body>${content}${evidence}</body></html>`;
}

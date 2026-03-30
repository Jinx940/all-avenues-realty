import { useMemo, useState } from 'react';
import { buildAssetUrl, requestJson } from '../lib/api';
import { buildGeneratedPdfBlob, downloadPdfBlob } from '../lib/generatedPdf';
import { formatAreaServiceLabel } from '../lib/jobLocation';
import type { GeneratedDocumentHistoryItem, JobRow, PropertySummary } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { UiIcon } from './UiIcon';

type DocumentType = 'Invoice' | 'Quote';
type OwnerKey = 'aze' | 'ryan';

type PdfServiceItem = {
  service: string;
  description: string;
  unitPrice: number;
};

type LegacyServiceGroup = {
  service: string;
  totalPrice: number;
  sentences: string[];
};

type AzeInvoiceRow = {
  service: string;
  totalPrice: number;
  bullets: string[];
  continuation?: boolean;
  showService?: boolean;
  showPrice?: boolean;
  showDivider?: boolean;
};

type AzeInvoiceData = {
  invoiceNumber: string;
  docDate: string;
  clientName: string;
  clientCompany: string;
  propertyAddress: string;
  propertyCityLine: string;
  billTo: string;
  startDate: string;
  finishDate: string;
  selectedItems: PdfServiceItem[];
  ryanLabor: number;
  juanLabor: number;
  jobTotal: number;
  expenses: number;
  totalDue: number;
};

type LegacyPdfData = {
  ownerKey: OwnerKey;
  documentType: DocumentType;
  invoiceNumber: string;
  docDate: string;
  billTo: string;
  propertyAddress: string;
  timeFrame: string;
  selectedItems: PdfServiceItem[];
  ryanLabor: number;
  juanLabor: number;
  jobTotal: number;
  materialExpense: number;
  totalDue: number;
};

type SaveGeneratedDocumentResponse = {
  id: string;
  fileName: string;
  url: string;
  printUrl: string;
  documentNumber: string;
};

type JobSelectionState = {
  propertyId: string;
  ids: string[];
  mode: 'auto' | 'manual';
};

const headerOwnerOptions = ['Sterling Mechanical (AZE)', 'Sterling Mechanical (Ryan)'] as const;

const formatUsd = (value: number) => `$${value.toFixed(2)}`;
const formatPdfNumber = (value: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const formatPdfMoney = (value: number) => `$ ${formatPdfNumber(value)}`;

const toAmount = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const blobToBase64 = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return window.btoa(binary);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const ownerKeyFor = (owner: (typeof headerOwnerOptions)[number]): OwnerKey =>
  owner.includes('Ryan') ? 'ryan' : 'aze';

const getLocalTodayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatPdfDate = (value: string | null) => {
  if (!value) return '-';

  const raw = String(value).trim();
  if (!raw) return '-';

  const isoLikeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLikeMatch) {
    const [, year, month, day] = isoLikeMatch;
    return `${month}/${day}/${year}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = parsed.getFullYear();

  return `${month}/${day}/${year}`;
};

const cleanSentenceForPdf = (value: string) =>
  value
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`*•-]+/g, '')
    .replace(/[\s"'`]+$/g, '')
    .trim();

const isMeaningfulPdfSentence = (value: string) => /[A-Za-zÀ-ÿ0-9]/.test(value);

const splitDescriptionIntoSentences = (value: string) => {
  const raw = value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const matches = raw.match(/[^.!?;]+[.!?;]+["']?|[^.!?;]+$/g) ?? [raw];
  return matches.map(cleanSentenceForPdf).filter(isMeaningfulPdfSentence);
};

const buildLegacyServiceGroups = (items: PdfServiceItem[]): LegacyServiceGroup[] => {
  const groups = new Map<string, LegacyServiceGroup>();

  items.forEach((item) => {
    const service = item.service.trim();
    if (!service) return;

    const existing = groups.get(service) ?? {
      service,
      totalPrice: 0,
      sentences: [],
    };

    existing.totalPrice += item.unitPrice;

    splitDescriptionIntoSentences(item.description).forEach((sentence) => {
      if (sentence) {
        existing.sentences.push(sentence);
      }
    });

    groups.set(service, existing);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    sentences: group.sentences.length ? group.sentences : [''],
  }));
};

const buildAzeInvoiceTableRows = (items: PdfServiceItem[]): AzeInvoiceRow[] =>
  items
    .flatMap((item) => {
      const bullets = splitDescriptionIntoSentences(item.description);
      const baseRow = {
        service: item.service.trim(),
        totalPrice: item.unitPrice,
        bullets: bullets.length ? bullets : [''],
        showService: true,
        showPrice: true,
      };

      return splitAzeInvoiceRow(baseRow);
    })
    .filter((row) => row.service || row.bullets.some(Boolean) || row.totalPrice);

const estimateAzeInvoiceRowUnits = (row: AzeInvoiceRow) => {
  const serviceLines = Math.max(1, Math.ceil(row.service.length / 15));
  const descLines = row.bullets.reduce(
    (sum, bullet) => sum + Math.max(1, Math.ceil(bullet.length / 26)),
    0,
  );

  return 1.1 + serviceLines * 0.18 + descLines * 0.28;
};

const splitAzeInvoiceRow = (row: AzeInvoiceRow) => {
  const maxChunkUnits = 9.4;
  if (estimateAzeInvoiceRowUnits(row) <= maxChunkUnits || row.bullets.length <= 1) {
    return [row];
  }

  const chunks: AzeInvoiceRow[] = [];
  let chunkBullets: string[] = [];
  let chunkIndex = 0;

  const flushChunk = () => {
    if (!chunkBullets.length) return;

    chunks.push({
      service: row.service,
      totalPrice: row.totalPrice,
      bullets: chunkBullets,
      continuation: chunkIndex > 0,
      showService: chunkIndex === 0,
      showPrice: chunkIndex === 0,
      showDivider: true,
    });

    chunkBullets = [];
    chunkIndex += 1;
  };

  row.bullets.forEach((bullet) => {
    const candidateBullets = [...chunkBullets, bullet];
    const candidateRow: AzeInvoiceRow = {
      service: row.service,
      totalPrice: row.totalPrice,
      bullets: candidateBullets,
      continuation: chunkIndex > 0,
      showService: chunkIndex === 0,
      showPrice: chunkIndex === 0,
    };

    if (chunkBullets.length && estimateAzeInvoiceRowUnits(candidateRow) > maxChunkUnits) {
      flushChunk();
      chunkBullets = [bullet];
      return;
    }

    chunkBullets = candidateBullets;
  });

  flushChunk();

  chunks.forEach((chunk, index) => {
    chunk.showDivider = index === chunks.length - 1;
  });

  return chunks.length ? chunks : [row];
};

const buildAzeInvoicePageCapacities = (pageCount: number) => {
  const firstOnlyPageLimit = 10.8;
  const firstPageLimit = 10.4;
  const middlePageLimit = 15.8;
  const lastContinuePageLimit = 13.2;

  if (pageCount <= 1) {
    return [firstOnlyPageLimit];
  }

  const capacities = [firstPageLimit];

  for (let index = 0; index < pageCount - 2; index += 1) {
    capacities.push(middlePageLimit);
  }

  capacities.push(lastContinuePageLimit);
  return capacities;
};

const paginateAzeInvoiceRows = (rows: AzeInvoiceRow[]) => {
  if (!rows.length) return [[]];

  const measuredRows = rows.map((row) => ({
    row,
    units: estimateAzeInvoiceRowUnits(row),
  }));

  for (let pageCount = 1; pageCount <= measuredRows.length + 1; pageCount += 1) {
    const capacities = buildAzeInvoicePageCapacities(pageCount);
    const pages = capacities.map(() => [] as AzeInvoiceRow[]);

    let pageIndex = 0;
    let usedUnits = 0;
    let fitsAll = true;

    for (const item of measuredRows) {
      const capacity = capacities[pageIndex];
      const canFitHere = usedUnits + item.units <= capacity;

      if (canFitHere) {
        pages[pageIndex].push(item.row);
        usedUnits += item.units;
        continue;
      }

      pageIndex += 1;
      usedUnits = 0;

      if (pageIndex >= capacities.length) {
        fitsAll = false;
        break;
      }

      if (item.units > capacities[pageIndex]) {
        fitsAll = false;
        break;
      }

      pages[pageIndex].push(item.row);
      usedUnits = item.units;
    }

    if (fitsAll) {
      while (pages.length > 1 && pages[pages.length - 1].length === 0) {
        pages.pop();
      }

      return pages.length ? pages : [[]];
    }
  }

  return [rows];
};

const buildAzeInvoiceRowsHtml = (rows: AzeInvoiceRow[]) =>
  rows
    .map((row) => {
      const bulletHtml = row.bullets.length
        ? `<ul>${row.bullets.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
        : '<ul><li></li></ul>';
      const serviceHtml = row.showService === false ? '&nbsp;' : escapeHtml(row.service);
      const costHtml =
        row.showPrice === false ? '&nbsp;' : escapeHtml(formatPdfMoney(row.totalPrice));
      const rowClass = [
        'row',
        row.continuation ? 'row-continuation' : '',
        row.showDivider === false ? 'row-no-divider' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <div class="${rowClass}">
          <div class="service${row.showService === false ? ' is-empty' : ''}">${serviceHtml}</div>
          <div class="desc">${bulletHtml}</div>
          <div class="cost${row.showPrice === false ? ' is-empty' : ''}">${costHtml}</div>
        </div>
      `;
    })
    .join('');

const azeInvoiceTableHeadHtml = `
  <div class="thead">
    <div>Service</div>
    <div>Description</div>
    <div>Cost per<br />Unit</div>
  </div>
`;

const buildAzeModernInvoiceHtml = (data: AzeInvoiceData) => {
  const tableRows = buildAzeInvoiceTableRows(data.selectedItems);
  const renderedPages = paginateAzeInvoiceRows(tableRows);
  const billToHtml = escapeHtml(data.billTo).replace(/\r?\n/g, '<br>');

  const summaryHtml = `
    <div class="summary-section">
      <div class="summary">
        <div class="sum-row teal">
          <span>Ryan Labor</span>
          <span>${formatPdfMoney(data.ryanLabor)}</span>
        </div>
        <div class="sum-row teal">
          <span>Juan Labor</span>
          <span>${formatPdfMoney(data.juanLabor)}</span>
        </div>
        <div class="sum-row light">
          <span>Job Total</span>
          <span>${formatPdfMoney(data.jobTotal)}</span>
        </div>
        <div class="sum-row expenses">
          <span>Expenses</span>
          <span>${formatPdfMoney(data.expenses)}</span>
        </div>
        <div class="sum-row total">
          <span>Total Due</span>
          <span>${formatPdfMoney(data.totalDue)}</span>
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <div class="footer">
      <div class="footer-item">
        <svg class="footer-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 30L32 10L56 30" stroke="#2f49a7" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 28V54H50V28" stroke="#2f49a7" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M26 54V38H38V54" stroke="#2f49a7" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="footer-text">
          <div>Concord Twp, Ohio</div>
          <div>44077</div>
        </div>
      </div>

      <div class="footer-item">
        <svg class="footer-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="22" stroke="#2f49a7" stroke-width="3"/>
          <path d="M10 32H54" stroke="#2f49a7" stroke-width="2.6"/>
          <path d="M32 10C38 16 42 24 42 32C42 40 38 48 32 54C26 48 22 40 22 32C22 24 26 16 32 10Z" stroke="#2f49a7" stroke-width="2.6"/>
          <path d="M18 20C22 23 27 24 32 24C37 24 42 23 46 20" stroke="#2f49a7" stroke-width="2.2"/>
          <path d="M18 44C22 41 27 40 32 40C37 40 42 41 46 44" stroke="#2f49a7" stroke-width="2.2"/>
        </svg>
        <div class="footer-text">
          <div>Juan Azabache</div>
          <div>@azedj.pe</div>
        </div>
      </div>

      <div class="footer-item">
        <svg class="footer-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 10C18 10 22 22 28 28C34 34 46 38 46 38L52 32C54 30 57 30 59 32L62 35C64 37 64 41 62 43L54 51C51 54 46 55 42 54C29 51 13 35 10 22C9 18 10 13 13 10L21 2C23 0 27 0 29 2L32 5C34 7 34 10 32 12L26 18C26 18 24 16 22 13C20 10 18 10 18 10Z" stroke="#2f49a7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="footer-text phone-text">
          <div>+1 (440) 666-5608</div>
        </div>
      </div>
    </div>
  `;

  const pagesHtml = renderedPages
    .map((pageRows, pageIndex) => {
      const isFirstPage = pageIndex === 0;
      const isLastPage = pageIndex === renderedPages.length - 1;
      const rowsHtml = buildAzeInvoiceRowsHtml(pageRows);
      const pageClassName = [
        'page',
        isFirstPage ? 'page-first' : 'page-continue',
        isLastPage ? 'page-last' : '',
      ]
        .filter(Boolean)
        .join(' ');

      if (isFirstPage) {
        return `
          <div class="${pageClassName}">
            <div class="page-main">
              <div class="top">
                <div class="brand-area">
                  <div class="brand">
                    <div class="brand-text">
                      <span class="line-1">IN</span>
                      <span class="line-2">VOI</span>
                      <span class="line-3">CE</span>
                    </div>

                    <div class="brand-mark">
                      <svg viewBox="0 0 140 140" class="invoice-mark" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 110 L20 35 A75 75 0 0 1 95 110 Z" fill="#969490" stroke="#ff5b5b" stroke-width="4" stroke-linejoin="miter" />
                        <rect x="96" y="18" width="22" height="22" fill="#969490" stroke="#ff5b5b" stroke-width="4" />
                      </svg>
                    </div>
                  </div>

                  <div class="invoice-no">
                    <span class="invoice-prefix">N&deg;</span>
                    <span class="invoice-number-value">${escapeHtml(data.invoiceNumber)}</span>
                  </div>
                </div>

                <div class="logo-area">
                  <div class="logo-bar"></div>
                  <svg class="az-logo" viewBox="0 0 512 208" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M60 170 L148 18" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M148 18 L210 126" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M116 128 H208" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round"/>
                    <path d="M214 40 L352 40" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round"/>
                    <path d="M352 40 L272 163" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M218 185 L358 185" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round"/>
                    <path d="M297 69 L218 185" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round"/>
                    <path d="M346 104 L402 104" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round"/>
                    <path d="M328 131 L383 131" stroke="#ff5b5b" stroke-width="12" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>

              <div class="client-strip">
                <div class="client-col">
                  <div class="label">Client's Name</div>
                  <div class="value">${escapeHtml(data.clientName)}</div>
                </div>
                <div class="client-col">
                  <div class="label">Client's Company</div>
                  <div class="value">${escapeHtml(data.clientCompany)}</div>
                </div>
                <div class="client-col">
                  <div class="label">Date</div>
                  <div class="value">${escapeHtml(formatPdfDate(data.docDate))}</div>
                </div>
              </div>

              <div class="content">
                <aside class="job-panel">
                  <div class="job-title">Job<br />Info</div>

                  <div class="job-block">
                    <div class="job-label">Address</div>
                    <div class="job-value">
                      ${escapeHtml(data.propertyAddress)}
                      ${data.propertyCityLine ? `<br><br>${escapeHtml(data.propertyCityLine)}` : ''}
                      ${data.billTo ? `<br><br>${billToHtml}` : ''}
                    </div>
                  </div>

                  <div class="job-block">
                    <div class="job-label">Start date</div>
                    <div class="job-value">${escapeHtml(formatPdfDate(data.startDate))}</div>
                  </div>

                  <div class="job-block">
                    <div class="job-label">Finish date</div>
                    <div class="job-value">${escapeHtml(formatPdfDate(data.finishDate))}</div>
                  </div>
                </aside>

                <section class="main">
                  <div class="table-block">
                    <div class="table">
                      ${azeInvoiceTableHeadHtml}
                      ${rowsHtml}
                    </div>
                    ${isLastPage ? summaryHtml : ''}
                  </div>
                </section>
              </div>
            </div>
            ${isLastPage ? `<div class="page-footer">${footerHtml}</div>` : ''}
          </div>
        `;
      }

      return `
          <div class="${pageClassName}">
            <div class="page-main continue-wrap">
              <section class="main main-full continue-main">
                <div class="table-block table-block-continue">
                  <div class="table continue-table">${rowsHtml}</div>
                  ${isLastPage ? summaryHtml : ''}
                </div>
              </section>
          </div>
          ${isLastPage ? `<div class="page-footer">${footerHtml}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; width: 210mm; min-height: 297mm; background: #d9d9d9 !important; font-family: Arial, Helvetica, sans-serif; color: #111111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { background: #d9d9d9 !important; overflow: hidden; }
            .page { width: 210mm; height: 297mm; margin: 0; padding: 18mm 16mm 14mm 16mm; background: #d9d9d9 !important; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
            .page-first { padding: 18mm 16mm 16mm 16mm; }
            .page-continue { padding: 10mm 16mm 14mm 16mm; }
            .page:last-child { page-break-after: auto; break-after: auto; }
            .page-main { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
            .page-footer { margin-top: auto; padding-top: 6px; break-inside: avoid; page-break-inside: avoid; }
            .continue-wrap { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: flex-start; }
            .main-full { width: 100%; display: flex; flex-direction: column; flex: 1 1 auto; }
            .continue-main { justify-content: flex-start; }
            .continue-table { flex: 0 0 auto; margin-top: 0; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
          .brand-area { position: relative; width: 280px; height: 120px; }
          .brand { position: relative; display: flex; align-items: flex-start; gap: 18px; }
          .brand-text { display: flex; flex-direction: column; font-weight: 800; font-size: 30px; line-height: 1; letter-spacing: 6px; }
          .brand-text .line-2 { margin-left: 10px; }
          .brand-mark { width: 74px; height: 74px; display: flex; margin-top: -14px; margin-left: 6px; }
          .invoice-mark { width: 100%; height: 100%; display: block; }
          .invoice-no { position: absolute; left: 96px; top: 59px; font-size: 30px; font-weight: 800; line-height: 1; display: flex; align-items: center; gap: 6px; }
            .logo-area { position: relative; width: 196px; height: 95px; display: flex; flex-direction: column; align-items: center; }
            .logo-bar { width: 145px; height: 18px; background: #ff5b5b; margin: 0 0 8px; }
            .az-logo { width: 128px; height: 56px; display: block; margin: 0; }
          .client-strip { display: grid; grid-template-columns: 1fr 1.2fr 0.8fr; gap: 22px; align-items: start; margin-bottom: 22px; padding: 0 6px 0 84px; }
          .client-col { position: relative; padding-left: 10px; }
          .client-col::before { content: ""; position: absolute; left: 0; top: 0; width: 2px; height: 48px; background: #ff5b5b; }
          .label { font-size: 14px; margin-bottom: 4px; }
          .value { font-size: 16px; font-weight: 800; }
          .content { display: grid; grid-template-columns: 112px 1fr; gap: 14px; }
          .job-panel { background: #bfe6e8; min-height: 560px; padding: 16px 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
          .job-title { font-size: 27px; line-height: 1.05; font-weight: 500; margin: 0 0 42px; }
          .job-block { margin-bottom: 30px; width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; }
          .job-label { font-size: 14px; margin-bottom: 8px; }
          .job-value { font-size: 17px; font-weight: 400; line-height: 1.15; word-break: break-word; }
          .main { display: flex; flex-direction: column; min-height: 0; }
          .table-block { display: flex; flex-direction: column; width: 100%; }
          .table-block-continue { flex: 0 0 auto; }
          .table { width: 100%; }
            .thead { display: grid; grid-template-columns: 10ch 1fr 8ch; background: #ff5b5b; color: #ffffff; font-weight: 700; font-size: 18px; align-items: center; min-height: 68px; padding: 0 14px; column-gap: 10px; }
            .thead div { text-align: center; }
            .row { display: grid; grid-template-columns: 10ch 1fr 8ch; padding: 14px 10px; border-bottom: 2px solid rgba(58, 58, 58, 0.75); align-items: stretch; min-height: 64px; column-gap: 10px; }
            .row-continuation { padding-top: 0; min-height: auto; }
            .row-no-divider { border-bottom: none; padding-bottom: 0; min-height: auto; }
            .service { color: #ff5b5b; font-size: 13px; font-weight: 700; line-height: 1.15; padding: 4px 8px 0 8px; word-break: break-word; display: flex; align-items: center; justify-content: center; text-align: center; }
            .service.is-empty { color: transparent; }
            .desc { color: #2f49a7; font-size: 14px; line-height: 1.45; padding-right: 14px; }
            .desc ul { margin: 0; padding-left: 20px; }
            .desc li + li { margin-top: 4px; }
            .cost { color: #2f49a7; font-size: 14px; font-weight: 800; white-space: nowrap; padding: 4px 10px 0 10px; font-variant-numeric: tabular-nums; display: flex; align-items: center; justify-content: center; text-align: center; }
            .cost.is-empty { color: transparent; }
            .row-continuation .service,
            .row-continuation .cost { padding-top: 0; }
            .row-no-divider .service,
            .row-no-divider .cost { padding-bottom: 0; }
            .row-continuation .desc ul { margin-top: 0; }
            .summary-section { width: 100%; margin-top: 2px; display: flex; justify-content: flex-end; break-inside: avoid; page-break-inside: avoid; }
            .summary { width: 320px; margin: 0; align-self: flex-end; break-inside: avoid; page-break-inside: avoid; }
            .sum-row { display: grid; grid-template-columns: 1fr 130px; align-items: center; min-height: 54px; padding: 0 0 0 16px; border-bottom: 2px solid rgba(58, 58, 58, 0.75); font-size: 16px; }
          .sum-row.teal { background: #bfe6e8; color: #2f49a7; }
          .sum-row.light { color: #2f49a7; }
          .sum-row.expenses { color: #ff5b5b; }
          .sum-row.total { background: #2f49a7; color: #ffffff; border-bottom: none; font-weight: 800; }
          .sum-row span:first-child { padding-right: 12px; }
          .sum-row span:last-child { width: 130px; display: flex; align-items: center; justify-content: flex-end; padding-right: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
            .footer { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; align-items: center; padding: 12px 4px 0 4px; break-inside: avoid; page-break-inside: avoid; }
          .footer-item { display: flex; align-items: center; gap: 14px; }
          .footer-icon { width: 44px; height: 44px; flex: 0 0 44px; }
          .footer-text { color: #ff5b5b; font-size: 16px; line-height: 1.35; font-weight: 700; }
          .phone-text { display: flex; align-items: center; }
        </style>
      </head>
      <body>${pagesHtml}</body>
    </html>
  `;
};

const buildLegacySterlingPdfHtml = (data: LegacyPdfData) => {
  const companyInfoHtml =
    data.ownerKey === 'ryan'
      ? [
          '15222 Saranac Rd,',
          'Cleveland, OH 44110',
          '<strong>Main (440)289-9796</strong>',
          '<strong>Secondary (440)666-5608</strong>',
          '<strong>Ryangoertler1313@gmail.com</strong>',
        ].join('<br>')
      : [
          '15222 Saranac Rd,',
          'Lindmar Dr. Concord Twp. OH',
          '<strong>775 297-6035</strong>',
          '<strong>azabache643@gmail.com</strong>',
          'IG: azedj.pe',
        ].join('<br>');

  const groupedItems = buildLegacyServiceGroups(data.selectedItems);
  const billToHtml = escapeHtml(data.billTo).replace(/\r?\n/g, '<br>');
  const docDateHtml = escapeHtml(data.docDate);
  const headerClass = data.ownerKey === 'ryan' ? 'invoice-header ryan' : 'invoice-header aze';
  const materialLabel = data.documentType === 'Quote' ? 'Material Expense Estimate' : 'Material Expense';

  const groupedRowsHtml = groupedItems
    .map((group) =>
      group.sentences
        .map(
          (sentence, index) => `
            <tr>
              ${
                index === 0
                  ? `<td class="merge-service" rowspan="${group.sentences.length}">${escapeHtml(group.service)}</td>`
                  : ''
              }
              <td class="desc-cell">${escapeHtml(sentence)}</td>
              ${
                index === 0
                  ? `<td class="merge-price" rowspan="${group.sentences.length}">${formatPdfMoney(group.totalPrice)}</td>`
                  : ''
              }
            </tr>
          `,
        )
        .join(''),
    )
    .join('');

  const rightDetailsHtml =
    data.documentType === 'Quote'
      ? `
          <div><span class="label-blue">Address:</span> <span class="value-black">${escapeHtml(data.propertyAddress)}</span></div>
          <div><span class="label-blue">Time frame:</span> <span class="value-black">${escapeHtml(data.timeFrame)}</span></div>
          <div><span class="label-blue">Date:</span> <span class="value-black">${docDateHtml}</span></div>
        `
      : `
          <div><span class="label-blue">Bill to:</span> <span class="value-black">${billToHtml || '-'}</span></div>
          <div><span class="label-blue">Date:</span> <span class="value-black">${docDateHtml}</span></div>
        `;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(data.documentType)} ${escapeHtml(data.invoiceNumber)}</title>
        <style>
          @page { size: A4; margin: 0; }
          html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; background: #ffffff; font-family: Montserrat, Arial, sans-serif; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { overflow: hidden; }
          .page { width: 210mm; height: 297mm; margin: 0; padding: 18mm 16mm 18mm 16mm; background: #ffffff; overflow: hidden; box-sizing: border-box; }
          .invoice-header { width: 100%; padding: 24px 0; margin: 0; color: #ffffff; }
          .invoice-header.aze { background-color: #b40000; background-image: linear-gradient(to bottom, #b40000, #ff7c7c); }
          .invoice-header.ryan { background-color: #24c6dc; background-image: linear-gradient(to bottom, #24c6dc, #c471ed); }
          .header-inner { width: 100%; margin: 0 auto; padding: 0 30px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; }
          .header-left { line-height: 0.9; }
          .invoice-title { display: block; font-size: 58px; font-weight: 800; letter-spacing: 1px; color: #ffffff; }
          .invoice-number { display: block; font-size: 58px; font-weight: 800; color: #ffffff; }
          .header-right { text-align: right; font-size: 12px; line-height: 1.5; }
          .company-name { display: block; font-size: 30px; font-weight: 700; margin-bottom: 12px; }
          .company-info { font-size: 13px; }
          .company-info strong { font-weight: 800; }
          .invoice-body { padding: 14px 30px 0 30px; }
          table { border-collapse: collapse; width: 100%; background-color: #ffffff; }
          th, td { border: 1px solid #1f4dbb; padding: 8px; word-wrap: break-word; color: #1f4dbb; }
          th { background-color: #f2f2f2; color: #1f4dbb; text-align: center; }
          td.desc-cell { text-align: left; }
          td.merge-service { text-align: center; vertical-align: middle; font-weight: 800; width: 22%; }
          td.merge-price { text-align: center; vertical-align: middle; font-weight: 800; width: 18%; }
          .summary-label-blue { text-align: right; vertical-align: middle; color: #1f4dbb; font-weight: 800; }
          .amount-blue { text-align: center; color: #1f4dbb; font-weight: 800; font-size: 11px; vertical-align: middle; }
          .top-details-wrap { border-top: 3px solid #1f4dbb; margin-top: 8px; padding-top: 12px; margin-bottom: 14px; }
          .payment-title { color: #1f4dbb; font-weight: 800; font-size: 14px; display: block; margin-bottom: 6px; }
          .payment-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; }
          .payment-title-row { grid-column: 1 / -1; }
          .p-left, .p-right { font-size: 12px; line-height: 1.6; color: #000000; }
          .label-blue { color: #1f4dbb; font-weight: 800; }
          .value-black { color: #000000; font-weight: 400; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="${headerClass}">
            <div class="header-inner">
              <div class="header-left">
                <span class="invoice-title">${escapeHtml(data.documentType)}</span>
                <span class="invoice-number">No. ${escapeHtml(data.invoiceNumber)}</span>
              </div>
              <div class="header-right">
                <span class="company-name">Sterling<br>Mechanical</span>
                <div class="company-info">${companyInfoHtml}</div>
              </div>
            </div>
          </div>

          <div class="invoice-body">
            <div class="top-details-wrap">
              <div class="payment-grid">
                <div class="payment-title-row"><span class="payment-title">Payment Details:</span></div>
                <div class="p-left">
                  <div><span class="label-blue">Ship to:</span> <span class="value-black">All Avenues Realty LLC.</span></div>
                  <div class="value-black">crystalsarich@allavenuesrealty.com</div>
                </div>
                <div class="p-right">${rightDetailsHtml}</div>
              </div>
            </div>

            <table>
              <tr>
                <th>Service</th>
                <th>Description</th>
                <th>Unit Price (USD)</th>
              </tr>
              ${groupedRowsHtml}
              <tr>
                <td colspan="2" class="summary-label-blue">Ryan Labor</td>
                <td class="amount-blue">${formatPdfMoney(data.ryanLabor)}</td>
              </tr>
              <tr>
                <td colspan="2" class="summary-label-blue">Juan Labor</td>
                <td class="amount-blue">${formatPdfMoney(data.juanLabor)}</td>
              </tr>
              <tr>
                <td colspan="2" class="summary-label-blue">Job Total</td>
                <td class="amount-blue">${formatPdfMoney(data.jobTotal)}</td>
              </tr>
              <tr>
                <td colspan="2" class="summary-label-blue" style="color:red;">${escapeHtml(materialLabel)}</td>
                <td class="amount-blue" style="color:red;">${formatPdfMoney(data.materialExpense)}</td>
              </tr>
              <tr>
                <td colspan="2" class="summary-label-blue" style="font-size:16px;">Total Due</td>
                <td class="amount-blue" style="font-size:16px;">${formatPdfMoney(data.totalDue)}</td>
              </tr>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
};

export function InvoiceQuoteView({
  properties,
  jobs,
  documents,
  onDocumentSaved,
  onDocumentError,
}: {
  properties: PropertySummary[];
  jobs: JobRow[];
  documents: GeneratedDocumentHistoryItem[];
  onDocumentSaved?: (message: string) => void | Promise<void>;
  onDocumentError?: (message: string) => void | Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState('');
  const [headerOwner, setHeaderOwner] = useState<(typeof headerOwnerOptions)[number]>(headerOwnerOptions[0]);
  const [documentType, setDocumentType] = useState<DocumentType>('Invoice');
  const [documentNumber, setDocumentNumber] = useState('');
  const [billTo, setBillTo] = useState('');
  const [issueDate, setIssueDate] = useState(getLocalTodayIso);
  const [ryanLabor, setRyanLabor] = useState('0');
  const [juanLabor, setJuanLabor] = useState('0');
  const [advancePayment, setAdvancePayment] = useState('0');
  const [materialExpense, setMaterialExpense] = useState('0');
  const [jobSelection, setJobSelection] = useState<JobSelectionState>({
    propertyId: '',
    ids: [],
    mode: 'auto',
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatePdfConfirmOpen, setGeneratePdfConfirmOpen] = useState(false);
  const [generatePdfBusy, setGeneratePdfBusy] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPropertyId, setHistoryPropertyId] = useState('');
  const [historyOwner, setHistoryOwner] = useState<'ALL' | 'AZE' | 'RYAN'>('ALL');
  const [historyType, setHistoryType] = useState<'ALL' | 'INVOICE' | 'QUOTE'>('ALL');
  const [historyDateRange, setHistoryDateRange] = useState<'ALL' | 'TODAY' | '7' | '30'>('ALL');

  const normalizedPropertyId =
    propertyId && properties.some((property) => property.id === propertyId) ? propertyId : '';
  const propertyJobs = normalizedPropertyId
    ? jobs.filter((job) => job.propertyId === normalizedPropertyId)
    : [];
  const selectedJobIds =
    jobSelection.mode === 'manual' && jobSelection.propertyId === normalizedPropertyId
      ? propertyJobs.filter((job) => jobSelection.ids.includes(job.id)).map((job) => job.id)
      : propertyJobs.map((job) => job.id);
  const selectedJobs = propertyJobs.filter((job) => selectedJobIds.includes(job.id));
  const allSelected = propertyJobs.length > 0 && selectedJobIds.length === propertyJobs.length;
  const activeProperty = properties.find((property) => property.id === normalizedPropertyId) ?? null;
  const ownerKey = ownerKeyFor(headerOwner);
  const suggestedNumber = useMemo(
    () => getSuggestedDocumentNumber(documents, documentType),
    [documents, documentType],
  );
  const effectiveDocumentNumber = documentNumber.trim() || suggestedNumber;

  const selectedItems: PdfServiceItem[] = selectedJobs.map((job) => ({
    service: formatAreaServiceLabel(job.area, job.service),
    description: job.description || '',
    unitPrice: job.totalCost,
  }));

  const servicesTotal = selectedItems.reduce((sum, item) => sum + item.unitPrice, 0);
  const ryanLaborValue = toAmount(ryanLabor);
  const juanLaborValue = toAmount(juanLabor);
  const advancePaymentValue = toAmount(advancePayment);
  const materialExpenseValue = toAmount(materialExpense);
  const jobTotal = servicesTotal + ryanLaborValue + juanLaborValue;
  const expenses = materialExpenseValue + advancePaymentValue;
  const totalDue = Math.max(jobTotal - expenses, 0);

  const billToLines = billTo
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const clientName = billToLines[0] || 'Crystal Sarich';
  const clientCompany = billToLines[1] || 'All Avenues Realty';

  const jobDates = selectedJobs
    .flatMap((job) => [job.startDate, job.dueDate])
    .filter((value): value is string => Boolean(value))
    .sort();

  const firstJobDate = jobDates[0] ?? issueDate;
  const lastJobDate = jobDates[jobDates.length - 1] ?? issueDate;
  const propertyAddress = activeProperty?.address || activeProperty?.name || '-';
  const propertyCityLine = activeProperty?.cityLine || '';
  const timeFrame = `${formatPdfDate(firstJobDate)} - ${formatPdfDate(lastJobDate)}`;

  const previewRows = [
    { label: 'Services Total', value: servicesTotal },
    { label: 'Ryan Labor', value: ryanLaborValue },
    { label: 'Juan Labor', value: juanLaborValue },
    { label: 'Job Total', value: jobTotal },
    { label: 'Material Expense', value: materialExpenseValue },
    { label: 'Advance Payment', value: advancePaymentValue },
    { label: 'Expenses', value: expenses },
    { label: 'Total Due', value: totalDue, strong: true },
  ];

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      if (historyPropertyId && document.propertyId !== historyPropertyId) return false;
      if (historyOwner !== 'ALL' && document.owner !== historyOwner) return false;
      if (historyType !== 'ALL' && document.documentType !== historyType) return false;
      if (historySearch.trim()) {
        const haystack = [
          document.documentNumber,
          document.fileName,
          document.propertyName,
          document.ownerLabel,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(historySearch.trim().toLowerCase())) return false;
      }

      return matchesDocumentDateRange(document, historyDateRange);
    });
  }, [documents, historyDateRange, historyOwner, historyPropertyId, historySearch, historyType]);

  const toggleJobSelection = (jobId: string) => {
    setJobSelection({
      propertyId: normalizedPropertyId,
      ids: selectedJobIds.includes(jobId)
        ? selectedJobIds.filter((id) => id !== jobId)
        : [...selectedJobIds, jobId],
      mode: 'manual',
    });
  };

  const toggleSelectAll = () => {
    setJobSelection({
      propertyId: normalizedPropertyId,
      ids: allSelected ? [] : propertyJobs.map((job) => job.id),
      mode: 'manual',
    });
  };

  const resetPreview = () => {
    setRyanLabor('0');
    setJuanLabor('0');
    setAdvancePayment('0');
    setMaterialExpense('0');
    setJobSelection({
      propertyId: normalizedPropertyId,
      ids: propertyJobs.map((job) => job.id),
      mode: 'auto',
    });
  };

  const openDocument = (path: string) => {
    window.open(buildAssetUrl(path), '_blank', 'noopener,noreferrer,width=1060,height=900');
  };

  const buildGeneratedDocumentContent = () => {
    if (!selectedItems.length) {
      return null;
    }

    const useAzeModernInvoice = ownerKey === 'aze' && documentType === 'Invoice';
    const safeDocumentNumber = effectiveDocumentNumber || '00000000';
    const safeBaseName = `${documentType}_${(activeProperty?.name || 'property')
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '_')}_${safeDocumentNumber}`;
    const pdfFileName = `${safeBaseName}.pdf`;

    const html = useAzeModernInvoice
      ? buildAzeModernInvoiceHtml({
          invoiceNumber: safeDocumentNumber,
          docDate: issueDate,
          clientName,
          clientCompany,
          propertyAddress,
          propertyCityLine,
          billTo,
          startDate: firstJobDate,
          finishDate: lastJobDate,
          selectedItems,
          ryanLabor: ryanLaborValue,
          juanLabor: juanLaborValue,
          jobTotal,
          expenses,
          totalDue,
        })
      : buildLegacySterlingPdfHtml({
          ownerKey,
          documentType,
          invoiceNumber: safeDocumentNumber,
          docDate: issueDate,
          billTo,
          propertyAddress: [propertyAddress, propertyCityLine].filter(Boolean).join(', '),
          timeFrame,
          selectedItems,
          ryanLabor: ryanLaborValue,
          juanLabor: juanLaborValue,
          jobTotal,
          materialExpense: materialExpenseValue,
          totalDue,
        });

    return {
      html,
      pdfFileName,
      safeDocumentNumber,
    };
  };

  const handleGeneratePdf = async () => {
    if (!selectedItems.length) {
      await onDocumentError?.('Select at least one service before generating the PDF.');
      return;
    }

    setGeneratePdfConfirmOpen(true);
  };

  const handleConfirmGeneratePdf = async () => {
    const generated = buildGeneratedDocumentContent();
    if (!generated) {
      setGeneratePdfConfirmOpen(false);
      await onDocumentError?.('Select at least one service before generating the PDF.');
      return;
    }

    setGeneratePdfBusy(true);
    let saved: SaveGeneratedDocumentResponse | null = null;

    try {
      const pdfBlob = await buildGeneratedPdfBlob({
        html: generated.html,
      });
      const pdfBase64 = await blobToBase64(pdfBlob);

      saved = await requestJson<SaveGeneratedDocumentResponse>('/api/generated-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          propertyId: normalizedPropertyId,
          jobIds: selectedJobIds,
          documentType,
          ownerKey,
          documentNumber: generated.safeDocumentNumber,
          issueDate,
          fileName: generated.pdfFileName,
          mimeType: 'application/pdf',
          content: pdfBase64,
        }),
      });

      downloadPdfBlob(pdfBlob, generated.pdfFileName);

      setGeneratePdfConfirmOpen(false);
      await onDocumentSaved?.(
        `${documentType} ${saved.documentNumber} issued and downloaded as PDF.`,
      );
    } catch (error) {
      if (saved) {
        const partialMessage =
          error instanceof Error ? error.message : 'The PDF could not be downloaded.';
        await onDocumentError?.(
          `${documentType} ${saved.documentNumber} was saved, but the PDF download failed. ${partialMessage}`,
        );
      } else {
        const message = error instanceof Error ? error.message : 'Could not save the generated document.';
        await onDocumentError?.(message);
      }
    } finally {
      setGeneratePdfBusy(false);
      setGeneratePdfConfirmOpen(false);
    }
  };

  return (
    <section className="tab-panel">
      <div className="panel invoice-shell">
        <div className="invoice-shell-head">
          <div>
            <p className="page-kicker">Invoice / Quote Generator</p>
            <h2 className="title-with-icon">
              <UiIcon name="file" />
              <span>Generate Invoice / Quote</span>
            </h2>
            <p>Prepare a document preview using the jobs registered under a property.</p>
          </div>
        </div>

        <div className="invoice-section-card">
          <div className="invoice-section-head">
            <div>
              <p className="eyebrow">Document Setup</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="clipboard" />
                <span>{documentType} details</span>
              </h3>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Property
              <select value={normalizedPropertyId} onChange={(event) => setPropertyId(event.target.value)}>
                <option value="">Select a property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Header / Owner
              <select
                value={headerOwner}
                onChange={(event) =>
                  setHeaderOwner(event.target.value as (typeof headerOwnerOptions)[number])
                }
              >
                {headerOwnerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Document
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              >
                <option value="Invoice">Invoice</option>
                <option value="Quote">Quote</option>
              </select>
            </label>

            <label>
              No.
              <input
                value={documentNumber || suggestedNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="e.g. 2311"
              />
              <small className="muted-copy">Suggested next number: {suggestedNumber}</small>
            </label>

            <label>
              Date (MM/DD/YYYY)
              <input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </label>

            <label className="span-2">
              Bill To ({documentType})
              <textarea
                rows={4}
                value={billTo}
                onChange={(event) => setBillTo(event.target.value)}
                placeholder="Customer name and address"
              />
            </label>
          </div>
        </div>

        <div className="invoice-section-card">
          <div className="invoice-section-head">
            <div>
              <p className="eyebrow">Services</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="briefcase" />
                <span>{propertyJobs.length} loaded</span>
              </h3>
            </div>
            <label className="invoice-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={!propertyJobs.length}
              />
              <span>Select all</span>
            </label>
          </div>

          <div className="invoice-services-shell">
            <div className="invoice-services-table">
              <div className="invoice-services-row invoice-services-row--header">
                <span>Select</span>
                <span>Area / Service</span>
                <span>Description</span>
                <span>Unit Price (USD)</span>
              </div>

              {propertyJobs.length ? (
                propertyJobs.map((job) => (
                  <div key={job.id} className="invoice-services-row">
                    <span>
                      <input
                        className="invoice-service-check"
                        type="checkbox"
                        checked={selectedJobIds.includes(job.id)}
                        onChange={() => toggleJobSelection(job.id)}
                      />
                    </span>
                    <span className="invoice-service-name">{formatAreaServiceLabel(job.area, job.service)}</span>
                    <span>{job.description || '-'}</span>
                    <span>{formatUsd(job.totalCost)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-box">Select a property with jobs to generate a preview.</div>
              )}
            </div>
          </div>
        </div>

        <div className="invoice-section-card">
          <div className="invoice-section-head">
            <div>
              <p className="eyebrow">Additional Amounts</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="dollar" />
                <span>Manual amounts</span>
              </h3>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Ryan Labor (USD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={ryanLabor}
                onChange={(event) => setRyanLabor(event.target.value)}
              />
            </label>

            <label>
              Juan Labor (USD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={juanLabor}
                onChange={(event) => setJuanLabor(event.target.value)}
              />
            </label>

            <label>
              Advance Payment (optional)
              <input
                type="number"
                min="0"
                step="0.01"
                value={advancePayment}
                onChange={(event) => setAdvancePayment(event.target.value)}
              />
            </label>

            <label>
              Material Expense (USD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={materialExpense}
                onChange={(event) => setMaterialExpense(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="invoice-section-card">
          <p className="invoice-preview-note">Advance Payment is used only to compute Total Due.</p>

          <div className="invoice-preview-card">
            <div className="invoice-preview-head">
              <button
                type="button"
                className="invoice-preview-title"
                onClick={() => setPreviewOpen((current) => !current)}
              >
                <span className="invoice-preview-caret">{previewOpen ? 'v' : '>'}</span>
                <UiIcon name="chart" size={16} />
                <span>Live Preview Totals</span>
              </button>

              <div className="invoice-preview-actions">
                <button
                  type="button"
                  className="ghost-button invoice-preview-text-button"
                  onClick={() => setPreviewOpen((current) => !current)}
                >
                  {previewOpen ? 'Hide preview' : 'Show preview'}
                </button>
                <button type="button" className="ghost-button" onClick={resetPreview}>
                  Reset
                </button>
              </div>
            </div>

            {previewOpen ? (
              <div className="invoice-preview-grid">
                {previewRows.map((row) => (
                  <div
                    key={row.label}
                    className={`invoice-preview-item${row.strong ? ' invoice-preview-item--strong' : ''}`}
                  >
                    <span>{row.label}</span>
                    <strong>{formatUsd(row.value)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="invoice-generate-row">
            <button
              type="button"
              className="invoice-generate-button"
              onClick={handleGeneratePdf}
              disabled={!selectedItems.length}
            >
              <UiIcon name="file" />
              Generate PDF
            </button>
          </div>
        </div>

        <div className="invoice-section-card">
          <div className="invoice-section-head">
            <div>
              <p className="eyebrow">Document center</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="folder" />
                <span>Invoice / Quote history</span>
              </h3>
              <p>Search by No., property, owner and date, then reopen or print any saved document.</p>
            </div>
            <span className="pill tone-neutral">{filteredDocuments.length} document(s)</span>
          </div>

          <div className="invoice-history-filters">
            <label>
              Search No. / file
              <input
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search by No., file or property"
              />
            </label>

            <label>
              Property
              <select value={historyPropertyId} onChange={(event) => setHistoryPropertyId(event.target.value)}>
                <option value="">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Owner
              <select
                value={historyOwner}
                onChange={(event) => setHistoryOwner(event.target.value as 'ALL' | 'AZE' | 'RYAN')}
              >
                <option value="ALL">All owners</option>
                <option value="AZE">AZE</option>
                <option value="RYAN">Ryan</option>
              </select>
            </label>

            <label>
              Type
              <select
                value={historyType}
                onChange={(event) => setHistoryType(event.target.value as 'ALL' | 'INVOICE' | 'QUOTE')}
              >
                <option value="ALL">All documents</option>
                <option value="INVOICE">Invoices</option>
                <option value="QUOTE">Quotes</option>
              </select>
            </label>

            <label>
              Date
              <select
                value={historyDateRange}
                onChange={(event) =>
                  setHistoryDateRange(event.target.value as 'ALL' | 'TODAY' | '7' | '30')
                }
              >
                <option value="ALL">All dates</option>
                <option value="TODAY">Today</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </label>
          </div>

          <div className="invoice-history-table-shell">
            <div className="invoice-history-table">
              <div className="invoice-history-row invoice-history-row--header">
                <span>No.</span>
                <span>Type</span>
                <span>Owner</span>
                <span>Property</span>
                <span>Date</span>
                <span>Linked Jobs</span>
                <span>Actions</span>
              </div>

              {filteredDocuments.length ? (
                filteredDocuments.map((document) => (
                  <div key={document.id} className="invoice-history-row">
                    <span className="invoice-history-number">{document.documentNumber}</span>
                    <span>{document.documentTypeLabel}</span>
                    <span>{document.ownerLabel}</span>
                    <span>
                      <strong>{document.propertyName}</strong>
                    </span>
                    <span>{formatPdfDate(document.issueDate || document.createdAt)}</span>
                    <span>{document.linkedJobCount}</span>
                    <span>
                      <div className="records-action-group">
                        <button
                          type="button"
                          className="ghost-button records-action-button records-action-button--open"
                          onClick={() => openDocument(document.url)}
                        >
                          <UiIcon name="file" size={15} />
                          Open
                        </button>
                        <button
                          type="button"
                          className="ghost-button records-action-button records-action-button--print"
                          onClick={() => openDocument(document.printUrl)}
                        >
                          <UiIcon name="receipt" size={15} />
                          Print
                        </button>
                      </div>
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-box">No saved invoices or quotes match these filters.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={generatePdfConfirmOpen}
        title={documentType === 'Invoice' ? 'Issue invoice PDF?' : 'Generate quote PDF?'}
        text={
          documentType === 'Invoice'
            ? `Invoice ${effectiveDocumentNumber || '00000000'} will be issued and downloaded as a PDF file.`
            : `Quote ${effectiveDocumentNumber || '00000000'} will be generated and downloaded as a PDF file.`
        }
        confirmLabel={documentType === 'Invoice' ? 'Issue and download PDF' : 'Generate and download PDF'}
        cancelLabel="Cancel"
        tone="success"
        busy={generatePdfBusy}
        onConfirm={() => void handleConfirmGeneratePdf()}
        onCancel={() => {
          if (!generatePdfBusy) {
            setGeneratePdfConfirmOpen(false);
          }
        }}
      />
    </section>
  );
}

function getSuggestedDocumentNumber(
  documents: GeneratedDocumentHistoryItem[],
  documentType: DocumentType,
) {
  const targetType = documentType === 'Invoice' ? 'INVOICE' : 'QUOTE';
  const numericValues = documents
    .filter((document) => document.documentType === targetType)
    .map((document) => Number.parseInt(document.documentNumber, 10))
    .filter((value) => Number.isFinite(value));

  return String((numericValues.length ? Math.max(...numericValues) : 1000) + 1);
}

function matchesDocumentDateRange(
  document: GeneratedDocumentHistoryItem,
  range: 'ALL' | 'TODAY' | '7' | '30',
) {
  if (range === 'ALL') return true;

  const rawDate = document.issueDate || document.createdAt;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime()) / 86400000);

  if (range === 'TODAY') {
    return diffDays === 0;
  }

  const limit = Number.parseInt(range, 10);
  return diffDays >= 0 && diffDays < limit;
}

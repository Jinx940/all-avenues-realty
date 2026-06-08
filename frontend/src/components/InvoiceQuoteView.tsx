import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, buildAssetUrl, fetchAssetBlob, requestJson } from '../lib/api';
import { buildGeneratedPdfBlob, downloadPdfBlob, type GeneratedPdfReceiptAppendix } from '../lib/generatedPdf';
import { formatAreaServiceLabel } from '../lib/jobLocation';
import type { GeneratedDocumentHistoryItem, JobRow, PropertySummary } from '../types';
import homeEnvyLogoUrl from '../assets/Home_envy_logo.png';
import moralesLogoUrl from '../assets/Morales.jpg';
import ryanLogoUrl from '../assets/ryan-logo-transparent.png';
import { ConfirmDialog } from './ConfirmDialog';
import { UiIcon } from './UiIcon';

type DocumentType = 'Invoice' | 'Quote';
type OwnerKey = 'aze' | 'ryan' | 'todd' | 'morales';
type DocumentOwnerCode = 'AZE' | 'RYAN' | 'TODD' | 'MORALES';
type DocumentOwnerFilter = 'ALL' | DocumentOwnerCode;
type DocumentOwnerLabel = 'AZE' | 'Ryan Goertler' | 'Todd Goertler' | 'Morales Home Improvement';

const pdfTypewriterFontFamily = '"Courier New", Courier, "Liberation Mono", monospace';
const azeInvoiceFontFamily = '"Segoe UI", Arial, Helvetica, sans-serif';

type PdfServiceItem = {
  story: string;
  unit: string;
  area: string;
  service: string;
  description: string;
  labor: number;
  unitPrice: number;
};

type PdfAttachmentFile = {
  id: string;
  kind: 'before' | 'after' | 'receipt';
  jobId: string;
  label: string;
  fileName: string;
  url: string;
  mimeType: string;
  createdAt: string;
};

type LegacyServiceGroup = {
  service: string;
  totalPrice: number;
  sentences: string[];
};

type LegacyServiceChunk = {
  service: string;
  totalPrice: number;
  sentences: string[];
  continuation: boolean;
  showPrice: boolean;
};

type RyanInvoiceGroup = {
  unit: string;
  area: string;
  service: string;
  totalPrice: number;
  sentences: string[];
};

type RyanInvoiceChunk = RyanInvoiceGroup & {
  continuation: boolean;
  showPrice: boolean;
};

type RyanInvoiceDisplayChunk = RyanInvoiceChunk & {
  showUnit: boolean;
  unitRowSpan: number;
  showArea: boolean;
  areaRowSpan: number;
};

type RyanInvoiceColumnLayout = {
  unit: number;
  area: number;
  service: number;
  description: number;
  price: number;
};

type AzeInvoiceRow = {
  story: string;
  unit: string;
  area: string;
  service: string;
  totalPrice: number;
  bullets: string[];
  continuation?: boolean;
  showUnit?: boolean;
  showArea?: boolean;
  showService?: boolean;
  showPrice?: boolean;
  showDivider?: boolean;
};

type AzeInvoiceDisplayRow = AzeInvoiceRow & {
  showUnitCell: boolean;
  unitRowSpan: number;
  showAreaCell: boolean;
  areaRowSpan: number;
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
  attachments: PdfAttachmentFile[];
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

type SterlingMechanicalInvoiceData = {
  invoiceNumber: string;
  docDate: string;
  billTo: string;
  propertyName: string;
  selectedItems: PdfServiceItem[];
  laborTotal: number;
  expenses: number;
  invoicingServices: number;
  jobTotal: number;
  totalDue: number;
  observation: string;
  attachments: PdfAttachmentFile[];
};

type MoralesInvoiceData = {
  docDate: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  selectedItems: PdfServiceItem[];
  laborTotal: number;
  expenses: number;
  invoicingServices: number;
  jobTotal: number;
  totalDue: number;
  observation: string;
};

type SterlingInvoiceRow = {
  unit: string;
  area: string;
  service: string;
  descriptionLines: string[];
  descriptionLineGroups: string[][];
  labor: number;
  unitPrice: number;
  continuation?: boolean;
  showDetails?: boolean;
  showMoney?: boolean;
  showDivider?: boolean;
};

type SterlingInvoiceDisplayRow = SterlingInvoiceRow & {
  showUnitCell: boolean;
  unitRowSpan: number;
  showAreaCell: boolean;
  areaRowSpan: number;
  showServiceCell: boolean;
  serviceRowSpan: number;
};

type SaveGeneratedDocumentResponse = {
  id: string;
  fileName: string;
  url: string;
  printUrl: string;
  documentNumber: string;
};

type GeneratedDocumentContent = {
  html: string;
  pdfFileName: string;
  safeDocumentNumber: string;
};

type EvidenceAttachmentPair = {
  before: PdfAttachmentFile | null;
  after: PdfAttachmentFile | null;
};
type JobFileAttachment = JobRow['files']['before'][number];
type JobFileBucket = keyof JobRow['files'];

type JobSelectionState = {
  propertyId: string;
  ids: string[];
  mode: 'auto' | 'manual';
};

type InvoiceServiceGroupKeySource = Pick<PdfServiceItem, 'story' | 'unit' | 'area' | 'service'>;

type InvoiceJobGroup = InvoiceServiceGroupKeySource & {
  key: string;
  jobs: JobRow[];
};

const headerOwnerOptions = ['Juan Azabache (AZE)', 'Ryan Goertler', 'Todd Goertler', 'Morales'] as const;

const formatUsd = (value: number) => `$${value.toFixed(2)}`;
const formatPdfNumber = (value: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const formatPdfMoney = (value: number) => `$ ${formatPdfNumber(value)}`;
const formatSterlingTableAmount = (value: number) => (Math.abs(value) < 0.005 ? '0' : formatPdfNumber(value));
const invoiceCellCollator = new Intl.Collator('en-US', {
  numeric: true,
  sensitivity: 'base',
});
const pdfImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const getPdfFileExtension = (value: string) => {
  const cleanValue = value.split(/[?#]/)[0] ?? '';
  const match = cleanValue.match(/\.([A-Za-z0-9]+)$/);
  return match ? `.${match[1].toLowerCase()}` : '';
};
const isPdfImageFile = (fileName: string) =>
  pdfImageExtensions.has(getPdfFileExtension(fileName));
const isPdfEmbeddableAttachment = (
  attachment: Pick<PdfAttachmentFile, 'fileName'>,
) => isPdfImageFile(attachment.fileName);
const isPdfDocumentFile = (fileName: string) => getPdfFileExtension(fileName) === '.pdf';
const isPdfReceiptFile = (file: Pick<JobRow['files']['receipt'][number], 'name' | 'mimeType'>) =>
  isPdfImageFile(file.name) ||
  isPdfDocumentFile(file.name) ||
  String(file.mimeType ?? '').toLowerCase().startsWith('image/') ||
  String(file.mimeType ?? '').toLowerCase().includes('pdf');
const normalizePdfAttachmentKind = (value: string | null | undefined): PdfAttachmentFile['kind'] | null => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (normalized === 'before') return 'before';
  if (normalized === 'after') return 'after';
  if (normalized === 'receipt' || normalized === 'receipts') return 'receipt';

  return null;
};
const invoicePhotoAttachmentKinds = new Set<PdfAttachmentFile['kind']>(['before', 'after']);
const receiptAttachmentKinds = new Set<PdfAttachmentFile['kind']>(['receipt']);
const selectableAttachmentKinds: Array<PdfAttachmentFile['kind']> = ['before', 'after', 'receipt'];

const toAmount = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const roundCurrencyAmount = (value: number) => Math.round(value * 100) / 100;

const blobToBase64 = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return window.btoa(binary);
};

const blobToDataUrl = async (blob: Blob, mimeType: string) =>
  `data:${mimeType};base64,${await blobToBase64(blob)}`;

const sniffImageBlobMimeType = async (blob: Blob) => {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
};

const inlinePdfAttachmentImages = async (attachments: PdfAttachmentFile[]) => {
  const embedded = await Promise.all(
    attachments
      .filter(isPdfEmbeddableAttachment)
      .map(async (attachment) => {
        try {
          const blob = await fetchAssetBlob(attachment.url);
          const detectedMimeType = await sniffImageBlobMimeType(blob);
          if (!detectedMimeType) {
            return null;
          }

          return {
            ...attachment,
            url: await blobToDataUrl(blob, detectedMimeType),
            mimeType: detectedMimeType,
          };
        } catch {
          return null;
        }
      }),
  );

  return embedded.filter((attachment): attachment is PdfAttachmentFile => Boolean(attachment));
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const ownerKeyFor = (owner: (typeof headerOwnerOptions)[number]): OwnerKey => {
  if (owner.includes('Morales')) return 'morales';
  if (owner.includes('Todd')) return 'todd';
  if (owner.includes('Ryan')) return 'ryan';
  return 'aze';
};

const ownerLabelFor = (ownerKey: OwnerKey): DocumentOwnerLabel => {
  if (ownerKey === 'morales') return 'Morales Home Improvement';
  if (ownerKey === 'ryan') return 'Ryan Goertler';
  if (ownerKey === 'todd') return 'Todd Goertler';
  return 'AZE';
};

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
  const segments = value
    .split(/\r?\n+/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const sourceSegments = segments.length ? segments : [value.replace(/\s+/g, ' ').trim()];

  return sourceSegments.flatMap((segment) => {
    if (!segment) return [];

    const matches = segment.match(/[^.!?;]+[.!?;]+["']?|[^.!?;]+$/g) ?? [segment];
    return matches.map(cleanSentenceForPdf).filter(isMeaningfulPdfSentence);
  });
};

const normalizeInvoiceDescriptionLine = (value: string) => {
  const cleaned = value
    .replace(/^\s*[-*\u2013\u2014\u2022]+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/[.!?]$/.test(cleaned)) return cleaned;
  return `${cleaned}.`;
};

const normalizeInvoiceDescription = (value: string) => {
  const lines = value
    .split(/\r?\n+/)
    .map(normalizeInvoiceDescriptionLine)
    .filter(Boolean);

  if (lines.length) {
    return lines.join('\n');
  }

  return normalizeInvoiceDescriptionLine(value.replace(/\r?\n/g, ' '));
};

const displayInvoiceCell = (value: string, fallback = '-') => value.trim() || fallback;

const splitInvoiceCellLines = (value: string, fallback = '-') => {
  const displayValue = displayInvoiceCell(value, fallback);
  const lines = displayValue
    .split(/\s*\/\s*/g)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return lines.length ? lines : [displayValue];
};

const buildInvoiceCellHtml = (value: string, fallback = '-') =>
  splitInvoiceCellLines(value, fallback).map(escapeHtml).join('<br>');

const renderInvoiceCellValue = (value: string, fallback = '-') => (
  <strong className="invoice-cell-lines">
    {splitInvoiceCellLines(value, fallback).map((line, index) => (
      <span key={`${line}-${index}`}>{line}</span>
    ))}
  </strong>
);

const normalizeInvoiceGroupKeyPart = (value: string, fallback = '-') =>
  splitInvoiceCellLines(value, fallback).join('/').toLowerCase();

const getSterlingUnitPriceFromLabor = (job: JobRow, labor: number) =>
  roundCurrencyAmount(Math.max(Number(job.totalCost || 0) - labor, 0));

const buildInvoiceServiceGroupKey = (item: InvoiceServiceGroupKeySource) =>
  [
    normalizeInvoiceGroupKeyPart(item.story),
    normalizeInvoiceGroupKeyPart(item.unit),
    normalizeInvoiceGroupKeyPart(item.area),
    normalizeInvoiceGroupKeyPart(item.service, 'General Service'),
  ].join('\u001f');

const buildInvoiceJobGroups = (jobs: JobRow[]): InvoiceJobGroup[] => {
  const groups = new Map<string, InvoiceJobGroup>();

  jobs.forEach((job) => {
    const key = buildInvoiceServiceGroupKey(job);
    const existing = groups.get(key);

    if (existing) {
      existing.jobs.push(job);
      return;
    }

    groups.set(key, {
      key,
      story: job.story,
      unit: job.unit,
      area: job.area,
      service: job.service,
      jobs: [job],
    });
  });

  return [...groups.values()];
};

const mergePdfServiceItems = (items: PdfServiceItem[]): PdfServiceItem[] => {
  const groups = new Map<string, PdfServiceItem & { descriptions: string[] }>();

  items.forEach((item) => {
    const key = buildInvoiceServiceGroupKey(item);
    const description = normalizeInvoiceDescription(item.description);
    const existing = groups.get(key);

    if (existing) {
      existing.labor += item.labor;
      existing.unitPrice += item.unitPrice;
      if (description) {
        existing.descriptions.push(description);
      }
      return;
    }

    groups.set(key, {
      ...item,
      description,
      labor: item.labor,
      unitPrice: item.unitPrice,
      descriptions: description ? [description] : [],
    });
  });

  return [...groups.values()].map(({ descriptions, ...item }) => ({
    ...item,
    description: descriptions.length ? descriptions.join('\n\n') : item.description,
  }));
};

const buildPdfAttachmentsForJobs = (
  sourceJobs: JobRow[],
  allowedKinds: ReadonlySet<PdfAttachmentFile['kind']>,
): PdfAttachmentFile[] => {
  const seenAttachments = new Set<string>();

  return sourceJobs.flatMap((job) => {
    const label = [
      displayInvoiceCell(job.unit),
      displayInvoiceCell(job.area),
      displayInvoiceCell(job.service, 'General Service'),
    ]
      .filter((value) => value && value !== '-')
      .join(' - ');

    const buildAttachment = (kind: PdfAttachmentFile['kind'], file: JobFileAttachment): PdfAttachmentFile => ({
      id: file.id,
      kind,
      jobId: job.id,
      label: label || job.propertyName,
      fileName: file.name,
      url: buildAssetUrl(file.url),
      mimeType: file.mimeType,
      createdAt: file.createdAt,
    });

    return (Object.entries(job.files) as Array<[JobFileBucket, JobFileAttachment[]]>).flatMap(
      ([field, files]) =>
        files.flatMap((file) => {
          const kind = normalizePdfAttachmentKind(file.category) ?? normalizePdfAttachmentKind(field);

          if (!kind || !allowedKinds.has(kind)) {
            return [];
          }

          if (kind === 'receipt') {
            if (!isPdfReceiptFile(file)) {
              return [];
            }
          } else if (!isPdfImageFile(file.name)) {
            return [];
          }

          const duplicateKey = [
            kind,
            file.name.trim().toLowerCase(),
            file.size,
            file.mimeType.trim().toLowerCase(),
          ].join('|');

          if (seenAttachments.has(duplicateKey)) {
            return [];
          }

          seenAttachments.add(duplicateKey);
          return [buildAttachment(kind, file)];
        }),
    );
  });
};

const compareInvoiceCells = (left: string, right: string) => {
  const leftIsFallback = left === '-';
  const rightIsFallback = right === '-';

  if (leftIsFallback !== rightIsFallback) {
    return leftIsFallback ? 1 : -1;
  }

  return invoiceCellCollator.compare(left, right);
};

const buildLegacyServiceGroups = (items: PdfServiceItem[]): LegacyServiceGroup[] => {
  const groups = new Map<string, LegacyServiceGroup>();

  items.forEach((item) => {
    const service = formatAreaServiceLabel(item.area, item.service).trim();
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

const buildRyanInvoiceGroups = (items: PdfServiceItem[]): RyanInvoiceGroup[] =>
  items.map((item) => ({
    unit: displayInvoiceCell(item.unit),
    area: displayInvoiceCell(item.area),
    service: displayInvoiceCell(item.service, 'General Service'),
    totalPrice: item.unitPrice,
    sentences: splitDescriptionIntoSentences(item.description).flatMap(splitLongRyanInvoiceSentence),
  }))
  .map((group) => ({
    ...group,
    sentences: group.sentences.length ? group.sentences : ['-'],
  }))
  .sort((left, right) =>
    compareInvoiceCells(left.unit, right.unit) ||
    compareInvoiceCells(left.area, right.area) ||
    compareInvoiceCells(left.service, right.service) ||
    invoiceCellCollator.compare(left.sentences.join(' '), right.sentences.join(' ')),
  );

const normalizeRyanInvoiceArea = (value: string) =>
  value
    .replace(/\r?\n+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

const isRyanInvoiceAddressArea = (value: string) => {
  const normalized = normalizeRyanInvoiceArea(value);
  if (!normalized || normalized === '-') return false;

  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 && /\d/.test(parts[0] ?? '');
};

const buildRyanInvoiceAreaHtml = (value: string) => {
  const normalized = normalizeRyanInvoiceArea(value);
  if (!normalized || normalized === '-') {
    return escapeHtml(value);
  }

  if (!isRyanInvoiceAddressArea(normalized)) {
    return buildInvoiceCellHtml(normalized);
  }

  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const [street = normalized, ...rest] = parts;
  const cityLine = rest.join(', ');
  const streetLine = street.endsWith(',') ? street : `${street},`;

  return `
    <span class="ryan-area-address">
      <span class="ryan-area-line">${escapeHtml(streetLine)}</span>
      <span class="ryan-area-line ryan-area-line--city">${escapeHtml(cityLine)}</span>
    </span>
  `;
};

const buildRyanInvoiceColumnLayout = (groups: RyanInvoiceGroup[]): RyanInvoiceColumnLayout => {
  const hasUnitData = groups.some((group) => group.unit !== '-');
  const hasAreaData = groups.some((group) => group.area !== '-');
  const hasAddressLikeAreas = groups.some((group) => isRyanInvoiceAddressArea(group.area));
  const longestDescription = groups.reduce(
    (max, group) => Math.max(max, ...group.sentences.map((sentence) => sentence.length), 0),
    0,
  );
  const compactDescriptions = longestDescription <= 48;

  const unit = hasUnitData ? 10 : 6;
  let area = hasAreaData ? (hasAddressLikeAreas ? 18 : 14) : 8;
  const service = 16;
  const price = 18;
  if (hasAddressLikeAreas && compactDescriptions) {
    area += 4;
  }

  const description = 100 - unit - area - service - price;

  return {
    unit,
    area,
    service,
    description,
    price,
  };
};

const estimateLegacySentenceUnits = (sentence: string) => {
  const normalized = sentence.trim();
  if (!normalized) return 1.1;

  return 0.82 + Math.max(1, Math.ceil(normalized.length / 66)) * 0.58;
};

const estimateLegacyChunkUnits = (chunk: LegacyServiceChunk) =>
  chunk.sentences.reduce((sum, sentence) => sum + estimateLegacySentenceUnits(sentence), 0) +
  Math.max(0, Math.ceil(chunk.service.length / 18) - 1) * 0.12;

const buildLegacyPageCapacities = (pageCount: number) => {
  const firstOnlyPageLimit = 18.6;
  const firstPageLimit = 23.8;
  const middlePageLimit = 31.4;
  const lastContinuePageLimit = 27.8;

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

const fitLegacyChunk = (
  group: LegacyServiceGroup,
  startIndex: number,
  availableUnits: number,
  continuation: boolean,
): LegacyServiceChunk | null => {
  if (availableUnits <= 0.4) {
    return null;
  }

  const sentences: string[] = [];
  let usedUnits = Math.max(0, Math.ceil(group.service.length / 18) - 1) * 0.12;

  for (let index = startIndex; index < group.sentences.length; index += 1) {
    const sentence = group.sentences[index];
    const rowUnits = estimateLegacySentenceUnits(sentence);

    if (sentences.length && usedUnits + rowUnits > availableUnits) {
      break;
    }

    sentences.push(sentence);
    usedUnits += rowUnits;

    if (usedUnits >= availableUnits) {
      break;
    }
  }

  if (!sentences.length) {
    return null;
  }

  return {
    service: group.service,
    totalPrice: group.totalPrice,
    sentences,
    continuation,
    showPrice: !continuation,
  };
};

const paginateLegacyServiceGroups = (groups: LegacyServiceGroup[]) => {
  if (!groups.length) return [[]];

  const maxPageCount = groups.reduce((total, group) => total + group.sentences.length, 0) + 1;

  for (let pageCount = 1; pageCount <= maxPageCount; pageCount += 1) {
    const capacities = buildLegacyPageCapacities(pageCount);
    const pages = capacities.map(() => [] as LegacyServiceChunk[]);
    let pageIndex = 0;
    let usedUnits = 0;
    let fitsAll = true;

    for (const group of groups) {
      let sentenceIndex = 0;
      let continuation = false;

      while (sentenceIndex < group.sentences.length) {
        if (pageIndex >= capacities.length) {
          fitsAll = false;
          break;
        }

        const availableUnits = capacities[pageIndex] - usedUnits;
        const chunk = fitLegacyChunk(group, sentenceIndex, availableUnits, continuation);

        if (!chunk) {
          pageIndex += 1;
          usedUnits = 0;
          continue;
        }

        const chunkUnits = estimateLegacyChunkUnits(chunk);

        if (chunkUnits > capacities[pageIndex] && usedUnits === 0) {
          fitsAll = false;
          break;
        }

        pages[pageIndex].push(chunk);
        usedUnits += chunkUnits;
        sentenceIndex += chunk.sentences.length;
        continuation = true;

        if (sentenceIndex < group.sentences.length) {
          pageIndex += 1;
          usedUnits = 0;
        }
      }

      if (!fitsAll) {
        break;
      }
    }

    if (fitsAll) {
      while (pages.length > 1 && pages[pages.length - 1].length === 0) {
        pages.pop();
      }

      return pages.length ? pages : [[]];
    }
  }

  return [groups.map((group) => ({
    service: group.service,
    totalPrice: group.totalPrice,
    sentences: group.sentences,
    continuation: false,
    showPrice: true,
  }))];
};

const legacyTableHeadHtml = `
  <tr>
    <th>Service</th>
    <th>Description</th>
    <th>Unit Price</th>
  </tr>
`;

const ryanInvoiceTableHeadHtml = `
  <tr>
    <th class="ryan-unit-head">Unit</th>
    <th class="ryan-area-head">Area</th>
    <th class="ryan-service-head">Service</th>
    <th class="ryan-desc-head">Description</th>
    <th class="ryan-price-head">Unit Price</th>
  </tr>
`;

function splitLongRyanInvoiceSentence(value: string) {
  const maxLength = 180;

  if (value.length <= maxLength) {
    return [value];
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [value];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  words.forEach((word) => {
    if (word.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }

      return;
    }

    const candidateChunk = currentChunk ? `${currentChunk} ${word}` : word;

    if (candidateChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = word;
      return;
    }

    currentChunk = candidateChunk;
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length ? chunks : [value];
}

const countRyanInvoiceChunkRows = (chunk: Pick<RyanInvoiceChunk, 'sentences'>) =>
  Math.max(chunk.sentences.length ? 1 : 0, 1);

const buildRyanInvoiceDescriptionHtml = (sentences: string[]) => {
  const lines = sentences.filter(Boolean);

  if (!lines.length) {
    return '-';
  }

  if (lines.length === 1) {
    return escapeHtml(lines[0]);
  }

  return `<div class="ryan-desc-stack">${lines
    .map((line) => `<div class="ryan-desc-line">${escapeHtml(line)}</div>`)
    .join('')}</div>`;
};

const buildRyanInvoiceDisplayChunks = (chunks: RyanInvoiceChunk[]): RyanInvoiceDisplayChunk[] => {
  const displayChunks = chunks.map((chunk) => ({
    ...chunk,
    showUnit: true,
    unitRowSpan: countRyanInvoiceChunkRows(chunk),
    showArea: true,
    areaRowSpan: countRyanInvoiceChunkRows(chunk),
  }));

  for (let index = 0; index < displayChunks.length; ) {
    const current = displayChunks[index];
    let endIndex = index + 1;
    let rowSpan = countRyanInvoiceChunkRows(current);

    while (endIndex < displayChunks.length && displayChunks[endIndex].unit === current.unit) {
      rowSpan += countRyanInvoiceChunkRows(displayChunks[endIndex]);
      displayChunks[endIndex].showUnit = false;
      displayChunks[endIndex].unitRowSpan = 0;
      endIndex += 1;
    }

    displayChunks[index].unitRowSpan = rowSpan;
    index = endIndex;
  }

  for (let index = 0; index < displayChunks.length; ) {
    const current = displayChunks[index];
    let endIndex = index + 1;
    let rowSpan = countRyanInvoiceChunkRows(current);

    while (
      endIndex < displayChunks.length &&
      displayChunks[endIndex].unit === current.unit &&
      displayChunks[endIndex].area === current.area
    ) {
      rowSpan += countRyanInvoiceChunkRows(displayChunks[endIndex]);
      displayChunks[endIndex].showArea = false;
      displayChunks[endIndex].areaRowSpan = 0;
      endIndex += 1;
    }

    displayChunks[index].areaRowSpan = rowSpan;
    index = endIndex;
  }

  return displayChunks;
};

const buildLegacyRowsHtml = (chunks: LegacyServiceChunk[]) =>
  chunks
    .map((chunk) =>
      chunk.sentences
        .map(
          (sentence, index) => `
            <tr class="${chunk.continuation ? 'legacy-group-row legacy-group-row--continuation' : 'legacy-group-row'}">
              ${
                index === 0
                  ? `<td class="service-cell${chunk.continuation ? ' service-cell--continuation' : ''}" rowspan="${chunk.sentences.length}">${buildInvoiceCellHtml(
                      chunk.service,
                    )}</td>`
                  : ''
              }
              <td class="desc-cell">${escapeHtml(sentence)}</td>
              ${
                index === 0
                  ? `<td class="price-cell${chunk.showPrice ? '' : ' is-empty'}" rowspan="${chunk.sentences.length}">${
                      chunk.showPrice ? formatPdfMoney(chunk.totalPrice) : '&nbsp;'
                    }</td>`
                  : ''
              }
            </tr>
          `,
        )
        .join(''),
    )
    .join('');

const buildRyanInvoiceRowsHtml = (chunks: RyanInvoiceChunk[]) =>
  buildRyanInvoiceDisplayChunks(chunks)
    .map((chunk) =>
      `
            <tr class="${chunk.continuation ? 'legacy-group-row legacy-group-row--continuation' : 'legacy-group-row'}">
              ${
                chunk.showUnit
                  ? `<td class="ryan-unit-cell${chunk.continuation ? ' ryan-meta-cell--continuation' : ''}" rowspan="${chunk.unitRowSpan}">${buildInvoiceCellHtml(
                      chunk.unit,
                    )}</td>`
                  : ''
              }
              ${
                chunk.showArea
                  ? `<td class="ryan-area-cell${chunk.continuation ? ' ryan-meta-cell--continuation' : ''}" rowspan="${chunk.areaRowSpan}">${buildRyanInvoiceAreaHtml(
                      chunk.area,
                    )}</td>`
                  : ''
              }
              ${
                `<td class="ryan-service-cell${chunk.continuation ? ' ryan-meta-cell--continuation' : ''}">${buildInvoiceCellHtml(
                      chunk.service,
                    )}</td>`
              }
              <td class="desc-cell ryan-desc-cell">${buildRyanInvoiceDescriptionHtml(chunk.sentences)}</td>
              ${
                `<td class="price-cell ryan-price-cell${chunk.showPrice ? '' : ' is-empty'}">${
                      chunk.showPrice ? formatPdfMoney(chunk.totalPrice) : '&nbsp;'
                    }</td>`
              }
            </tr>
          `,
    )
    .join('');

const buildAzeInvoiceTableRows = (items: PdfServiceItem[]): AzeInvoiceRow[] =>
  [...items]
    .sort((left, right) =>
      compareInvoiceCells(displayInvoiceCell(left.story), displayInvoiceCell(right.story)) ||
      compareInvoiceCells(displayInvoiceCell(left.unit), displayInvoiceCell(right.unit)) ||
      compareInvoiceCells(displayInvoiceCell(left.area), displayInvoiceCell(right.area)) ||
      compareInvoiceCells(displayInvoiceCell(left.service, 'General Service'), displayInvoiceCell(right.service, 'General Service')) ||
      invoiceCellCollator.compare(left.description, right.description),
    )
    .flatMap((item) => {
      const bullets = splitDescriptionIntoSentences(item.description);
      const baseRow = {
        story: displayInvoiceCell(item.story),
        unit: displayInvoiceCell(item.unit),
        area: displayInvoiceCell(item.area),
        service: displayInvoiceCell(item.service, 'General Service'),
        totalPrice: item.unitPrice,
        bullets: bullets.length ? bullets : [''],
        showUnit: true,
        showArea: true,
        showService: true,
        showPrice: true,
      };

      return splitAzeInvoiceRow(baseRow);
    })
    .filter((row) => row.story || row.unit || row.area || row.service || row.bullets.some(Boolean) || row.totalPrice);

const estimateAzeInvoiceRowUnits = (row: AzeInvoiceRow) => {
  const unitLines = Math.max(1, Math.ceil(row.unit.length / 12));
  const areaLines = Math.max(1, Math.ceil(row.area.length / 14));
  const serviceLines = Math.max(1, Math.ceil(row.service.length / 16));
  const descLines = row.bullets.reduce(
    (sum, bullet) => sum + Math.max(1, Math.ceil(bullet.length / 30)),
    0,
  );

  return 1.1 + Math.max(unitLines, areaLines, serviceLines) * 0.18 + descLines * 0.28;
};

const splitLongAzeInvoiceBullet = (value: string) => {
  const maxLength = 220;

  if (value.length <= maxLength) {
    return [value];
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [value];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  words.forEach((word) => {
    if (word.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }

      return;
    }

    const candidateChunk = currentChunk ? `${currentChunk} ${word}` : word;

    if (candidateChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = word;
      return;
    }

    currentChunk = candidateChunk;
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length ? chunks : [value];
};

const splitAzeInvoiceRow = (row: AzeInvoiceRow) => {
  const normalizedRow = {
    ...row,
    bullets: row.bullets.flatMap(splitLongAzeInvoiceBullet),
  };
  const maxChunkUnits = 11.2;
  if (estimateAzeInvoiceRowUnits(normalizedRow) <= maxChunkUnits || normalizedRow.bullets.length <= 1) {
    return [normalizedRow];
  }

  const chunks: AzeInvoiceRow[] = [];
  let chunkBullets: string[] = [];
  let chunkIndex = 0;

  const flushChunk = () => {
    if (!chunkBullets.length) return;

    chunks.push({
      story: normalizedRow.story,
      unit: normalizedRow.unit,
      area: normalizedRow.area,
      service: normalizedRow.service,
      totalPrice: normalizedRow.totalPrice,
      bullets: chunkBullets,
      continuation: chunkIndex > 0,
      showUnit: chunkIndex === 0,
      showArea: chunkIndex === 0,
      showService: chunkIndex === 0,
      showPrice: chunkIndex === 0,
      showDivider: true,
    });

    chunkBullets = [];
    chunkIndex += 1;
  };

  normalizedRow.bullets.forEach((bullet) => {
    const candidateBullets = [...chunkBullets, bullet];
    const candidateRow: AzeInvoiceRow = {
      story: normalizedRow.story,
      unit: normalizedRow.unit,
      area: normalizedRow.area,
      service: normalizedRow.service,
      totalPrice: normalizedRow.totalPrice,
      bullets: candidateBullets,
      continuation: chunkIndex > 0,
      showUnit: chunkIndex === 0,
      showArea: chunkIndex === 0,
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

  return chunks.length ? chunks : [normalizedRow];
};

const splitAzeInvoiceRowByBullet = (row: AzeInvoiceRow) => {
  if (row.bullets.length <= 1) {
    return [row];
  }

  return row.bullets.map<AzeInvoiceRow>((bullet, index) => ({
    ...row,
    bullets: [bullet],
    continuation: row.continuation || index > 0,
    showUnit: index === 0 ? row.showUnit : false,
    showArea: index === 0 ? row.showArea : false,
    showService: index === 0 ? row.showService : false,
    showPrice: index === 0 ? row.showPrice : false,
    showDivider: index === row.bullets.length - 1 ? row.showDivider : false,
  }));
};

const buildAzeInvoiceDisplayRows = (rows: AzeInvoiceRow[]): AzeInvoiceDisplayRow[] => {
  const displayRows = rows.map((row) => ({
    ...row,
    showUnitCell: true,
    unitRowSpan: 1,
    showAreaCell: true,
    areaRowSpan: 1,
  }));

  for (let index = 0; index < displayRows.length; ) {
    const current = displayRows[index];
    let endIndex = index + 1;
    let rowSpan = 1;

    while (
      endIndex < displayRows.length &&
      displayRows[endIndex].story === current.story &&
      displayRows[endIndex].unit === current.unit
    ) {
      rowSpan += 1;
      displayRows[endIndex].showUnitCell = false;
      displayRows[endIndex].unitRowSpan = 0;
      endIndex += 1;
    }

    displayRows[index].unitRowSpan = rowSpan;
    index = endIndex;
  }

  for (let index = 0; index < displayRows.length; ) {
    const current = displayRows[index];
    let endIndex = index + 1;
    let rowSpan = 1;

    while (
      endIndex < displayRows.length &&
      displayRows[endIndex].story === current.story &&
      displayRows[endIndex].unit === current.unit &&
      displayRows[endIndex].area === current.area
    ) {
      rowSpan += 1;
      displayRows[endIndex].showAreaCell = false;
      displayRows[endIndex].areaRowSpan = 0;
      endIndex += 1;
    }

    displayRows[index].areaRowSpan = rowSpan;
    index = endIndex;
  }

  return displayRows;
};

const buildAzeInvoicePageCapacities = (pageCount: number) => {
  const firstOnlyPageLimit = 10.8;
  const firstPageLimit = 14.4;
  const middlePageLimit = 26.8;
  const lastContinuePageLimit = 19.4;

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

const paginateAzeInvoiceRowsByEstimate = (rows: AzeInvoiceRow[]) => {
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
  buildAzeInvoiceDisplayRows(rows)
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
        <tr class="${rowClass}">
          ${
            row.showUnitCell
              ? `<td class="unit" rowspan="${row.unitRowSpan}">${buildInvoiceCellHtml(row.unit)}</td>`
              : ''
          }
          ${
            row.showAreaCell
              ? `<td class="area" rowspan="${row.areaRowSpan}">${buildInvoiceCellHtml(row.area)}</td>`
              : ''
          }
          <td class="service${row.showService === false ? ' is-empty' : ''}">${
            row.showService === false ? serviceHtml : buildInvoiceCellHtml(row.service)
          }</td>
          <td class="desc">${bulletHtml}</td>
          <td class="cost${row.showPrice === false ? ' is-empty' : ''}">${costHtml}</td>
        </tr>
      `;
    })
    .join('');

const azeInvoiceTableColumnsHtml = `
  <colgroup>
    <col class="aze-unit-col" />
    <col class="aze-area-col" />
    <col class="aze-service-col" />
    <col class="aze-desc-col" />
    <col class="aze-price-col" />
  </colgroup>
`;

const azeInvoiceTableHeadHtml = `
  <thead>
    <tr>
      <th>Unit</th>
      <th>Area</th>
      <th>Service</th>
      <th>Description</th>
      <th>Unit Price</th>
    </tr>
  </thead>
`;

const attachmentKindLabels: Record<PdfAttachmentFile['kind'], string> = {
  before: 'Before',
  after: 'After',
  receipt: 'Receipt',
};

const buildAttachmentCardHtml = (attachment: PdfAttachmentFile | null) => {
  if (!attachment) {
    return `
      <article class="attachment-card attachment-card--empty" aria-hidden="true">
        <div class="attachment-frame attachment-frame--empty"></div>
        <div class="attachment-caption attachment-caption--empty"></div>
      </article>
    `;
  }

  const label = escapeHtml(attachment.label);
  const kindLabel = attachmentKindLabels[attachment.kind];
  const crossOriginAttribute = attachment.url.startsWith('data:') ? '' : ' crossorigin="use-credentials"';

  return `
    <article class="attachment-card">
      <div class="attachment-frame">
        <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(kindLabel)}"${crossOriginAttribute} />
      </div>
      <div class="attachment-caption">
        <span>${escapeHtml(kindLabel)}</span>
        <strong>${label}</strong>
      </div>
    </article>
  `;
};

const buildAttachmentRowHtml = (cardsHtml: string) => `
  <div class="attachment-row">
    ${cardsHtml}
  </div>
`;

const buildAttachmentSectionStartHtml = (firstRowHtml: string) => `
  <div class="attachment-section-start">
    <div class="attachment-heading">Project Photos</div>
    ${firstRowHtml}
  </div>
`;

const buildEvidencePairs = (attachments: PdfAttachmentFile[]) => {
  const groupedAttachments = new Map<string, { before: PdfAttachmentFile[]; after: PdfAttachmentFile[] }>();

  attachments.forEach((attachment) => {
    if ((attachment.kind !== 'before' && attachment.kind !== 'after') || !isPdfEmbeddableAttachment(attachment)) {
      return;
    }

      const group = groupedAttachments.get(attachment.jobId) ?? { before: [], after: [] };
      group[attachment.kind].push(attachment);
      groupedAttachments.set(attachment.jobId, group);
  });

  return [...groupedAttachments.values()].flatMap<EvidenceAttachmentPair>((group) => {
    const pairCount = Math.max(group.before.length, group.after.length);
    return Array.from({ length: pairCount }, (_, index) => ({
      before: group.before[index] ?? null,
      after: group.after[index] ?? null,
    }));
  });
};

const buildEvidencePairCardsHtml = (pairs: EvidenceAttachmentPair[]) =>
  pairs
    .map((pair) => `${buildAttachmentCardHtml(pair.before)}${buildAttachmentCardHtml(pair.after)}`)
    .join('');

const buildAttachmentTailBlocks = (attachments: PdfAttachmentFile[]) => {
  if (!attachments.length) return [];

  const evidencePairs = buildEvidencePairs(attachments);
  const rows: string[] = [];

  evidencePairs.forEach((pair) => {
    rows.push(buildAttachmentRowHtml(buildEvidencePairCardsHtml([pair])));
  });

  if (!rows.length) return [];

  const firstRow = rows[0] as string;
  const remainingRows = rows.slice(1);

  return [buildAttachmentSectionStartHtml(firstRow), ...remainingRows];
};

const azeModernInvoiceLayoutStyles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 210mm; min-height: 297mm; background: #d9d9d9 !important; font-family: ${azeInvoiceFontFamily}; color: #111111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: #d9d9d9 !important; overflow: auto; }
  .page { width: 210mm; height: 297mm; margin: 0; padding: 18mm 16mm 14mm 16mm; background: #d9d9d9 !important; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
  .page-first { padding: 18mm 16mm 16mm 16mm; }
  .page-continue { padding: 14mm 16mm 14mm 16mm; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page-main { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .page-footer { flex: 0 0 auto; margin-top: auto; padding-top: 6px; break-inside: avoid; page-break-inside: avoid; }
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
  .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
  .job-panel { background: #bfe6e8; min-height: 86px; padding: 12px 16px; display: grid; grid-template-columns: 112px minmax(0, 1fr) minmax(0, 1fr) 112px 112px; gap: 16px; align-items: center; text-align: center; }
  .job-title { font-size: 24px; line-height: 1.05; font-weight: 400; margin: 0; text-align: center; }
  .job-block { margin: 0; width: 100%; min-width: 0; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .job-label { font-size: 13px; font-weight: 800; margin-bottom: 6px; }
  .job-value { font-size: 14px; font-weight: 400; line-height: 1.2; word-break: break-word; }
  .main { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .table-block { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; width: 100%; overflow: hidden; }
  .table-block-continue { flex: 0 0 auto; }
  .table { width: 100%; }
  .aze-invoice-table { border-collapse: collapse; table-layout: fixed; }
  .aze-unit-col { width: 72px; }
  .aze-area-col { width: 86px; }
  .aze-service-col { width: 108px; }
  .aze-price-col { width: 108px; }
  .aze-invoice-table th { background: #ff5b5b; color: #ffffff; font-weight: 700; font-size: 13px; line-height: 1.2; text-align: center; height: 58px; padding: 0 10px; }
  .aze-invoice-table td { min-height: 58px; padding: 12px 8px; border-bottom: 2px solid rgba(58, 58, 58, 0.75); vertical-align: middle; }
  .aze-invoice-table .unit,
  .aze-invoice-table .area,
  .aze-invoice-table .service { color: #ff5b5b; font-size: 12px; font-weight: 700; line-height: 1.15; word-break: break-word; text-align: center; }
  .aze-invoice-table .service.is-empty { color: transparent; }
  .aze-invoice-table .desc { color: #2f49a7; font-size: 14px; line-height: 1.45; padding-right: 14px; }
  .aze-invoice-table .desc ul { margin: 0; padding-left: 20px; }
  .aze-invoice-table .desc li + li { margin-top: 4px; }
  .aze-invoice-table .cost { color: #2f49a7; font-size: 14px; font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; text-align: center; }
  .aze-invoice-table .cost.is-empty { color: transparent; }
  .aze-invoice-table .row-continuation .service,
  .aze-invoice-table .row-continuation .cost { padding-top: 0; }
  .aze-invoice-table .row-no-divider .service,
  .aze-invoice-table .row-no-divider .cost { padding-bottom: 0; }
  .aze-invoice-table .row-continuation .desc ul { margin-top: 0; }
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
  .footer-rule { grid-column: 1 / -1; height: 1px; border-top: 1px solid rgba(47, 73, 167, 0.35); }
  .phone-text { display: flex; align-items: center; }
  .attachment-section-start { break-inside: avoid; page-break-inside: avoid; }
  .attachment-heading { margin-top: 12px; padding: 0 0 7px 0; border-bottom: 2px solid #ff5b5b; color: #111111; font-size: 16px; line-height: 1.2; font-weight: 800; break-inside: avoid; page-break-inside: avoid; }
  .attachment-row { flex: 0 0 74mm; height: 74mm; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
  .attachment-card { height: 100%; background: rgba(255, 255, 255, 0.35); border: 1px solid rgba(58, 58, 58, 0.28); display: flex; flex-direction: column; min-height: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .attachment-card--empty { background: transparent; border-color: transparent; }
  .attachment-frame { flex: 1 1 auto; min-height: 0; background: #efefef; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .attachment-frame--empty { background: transparent; }
  .attachment-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .attachment-caption { flex: 0 0 auto; display: grid; gap: 3px; padding: 10px 12px 12px; color: #111111; }
  .attachment-caption--empty { min-height: 48px; padding: 10px 12px 12px; }
  .attachment-caption span { color: #ff5b5b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
  .attachment-caption strong { color: #2f49a7; font-size: 13px; line-height: 1.25; }
`;

const buildAzeModernInvoiceHtml = (data: AzeInvoiceData) => {
  const tableRows = buildAzeInvoiceTableRows(data.selectedItems);
  const billToHtml = escapeHtml(data.billTo).replace(/\r?\n/g, '<br>');

  const summaryHtml = `
    <div class="summary-section">
      <div class="summary">
        <div class="sum-row teal">
          <span>Primary Labor</span>
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
      <div class="footer-rule"></div>
    </div>
  `;

  const buildAzeInvoicePageHtml = (
    pageRows: AzeInvoiceRow[],
    options: { isFirstPage: boolean; isLastPage: boolean; tailBlocks?: string[]; includeFooter: boolean },
  ) => {
    const rowsHtml = buildAzeInvoiceRowsHtml(pageRows);
    const pageClassName = [
      'page',
      options.isFirstPage ? 'page-first' : 'page-continue',
      options.isLastPage ? 'page-last' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const tailBlocksHtml = options.tailBlocks?.join('') ?? '';
    const footerSlot = options.includeFooter ? `<div class="page-footer">${footerHtml}</div>` : '';

    if (options.isFirstPage) {
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
                <div class="job-title">Job Info</div>

                <div class="job-block">
                  <div class="job-label">Address</div>
                  <div class="job-value">
                    ${escapeHtml(data.propertyAddress)}
                    ${data.propertyCityLine ? `<br>${escapeHtml(data.propertyCityLine)}` : ''}
                  </div>
                </div>

                <div class="job-block">
                  <div class="job-value">${billToHtml || '-'}</div>
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
                  <table class="table aze-invoice-table">
                    ${azeInvoiceTableColumnsHtml}
                    ${azeInvoiceTableHeadHtml}
                    <tbody>${rowsHtml}</tbody>
                  </table>
                  ${tailBlocksHtml}
                </div>
              </section>
            </div>
          </div>
          ${footerSlot}
        </div>
      `;
    }

    return `
      <div class="${pageClassName}">
        <div class="page-main continue-wrap">
          <section class="main main-full continue-main">
            <div class="table-block table-block-continue">
              <table class="table aze-invoice-table continue-table">
                ${azeInvoiceTableColumnsHtml}
                <tbody>${rowsHtml}</tbody>
              </table>
              ${tailBlocksHtml}
            </div>
          </section>
        </div>
        ${footerSlot}
      </div>
    `;
  };

  type AzeInvoicePageLayout = {
    rows: AzeInvoiceRow[];
    tailBlocks: string[];
    includeFooter: boolean;
  };

  const paginateAzeInvoiceRowsByLayout = () => {
    const attachmentTailBlocks = buildAttachmentTailBlocks(data.attachments);

    if (!tableRows.length) {
      return [
        { rows: [], tailBlocks: [summaryHtml], includeFooter: true },
        ...(attachmentTailBlocks.length
          ? [{ rows: [], tailBlocks: attachmentTailBlocks, includeFooter: false }]
          : []),
      ];
    }

    const fallbackPages = paginateAzeInvoiceRowsByEstimate(tableRows);

    if (typeof document === 'undefined') {
      const fallbackLayouts: AzeInvoicePageLayout[] = fallbackPages.map((rows) => ({
        rows,
        tailBlocks: [],
        includeFooter: false,
      }));
      fallbackLayouts[fallbackLayouts.length - 1].tailBlocks = [summaryHtml];
      fallbackLayouts[fallbackLayouts.length - 1].includeFooter = true;
      if (attachmentTailBlocks.length) {
        fallbackLayouts.push({ rows: [], tailBlocks: attachmentTailBlocks, includeFooter: false });
      }
      return fallbackLayouts;
    }

    const measurementHost = document.createElement('div');
    Object.assign(measurementHost.style, {
      position: 'fixed',
      left: '-250vw',
      top: '0',
      width: '210mm',
      minHeight: '297mm',
      visibility: 'hidden',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.body.appendChild(measurementHost);
    const measurementRoot = measurementHost.attachShadow({ mode: 'open' });

    const pageFits = (
      pageRows: AzeInvoiceRow[],
      options: { isFirstPage: boolean; tailBlocks?: string[]; includeFooter: boolean },
    ) => {
      measurementRoot.innerHTML = `
        <style>${azeModernInvoiceLayoutStyles}</style>
        ${buildAzeInvoicePageHtml(pageRows, {
          isFirstPage: options.isFirstPage,
          isLastPage: options.includeFooter,
          tailBlocks: options.tailBlocks,
          includeFooter: options.includeFooter,
        })}
      `;

      const pageMain = measurementRoot.querySelector<HTMLElement>('.page-main');
      const table = measurementRoot.querySelector<HTMLElement>('.aze-invoice-table');

      if (!pageMain || !table) {
        return true;
      }

      const measuredElements = [
        table,
        ...Array.from(
          measurementRoot.querySelectorAll<HTMLElement>('.summary-section, .attachment-section-start, .attachment-row'),
        ),
      ];
      const pageMainBottom = pageMain.getBoundingClientRect().bottom;
      const contentBottom = Math.max(
        ...measuredElements.map((element) => element.getBoundingClientRect().bottom),
      );

      return contentBottom <= pageMainBottom + 0.5;
    };

    const splitRowForRemainingPageSpace = (
      row: AzeInvoiceRow,
      currentPage: AzeInvoiceRow[],
      isFirstPage: boolean,
    ) => {
      const splitRows = splitAzeInvoiceRowByBullet(row);
      if (splitRows.length <= 1) {
        return null;
      }

      let bestRowCount = 0;
      let low = 1;
      let high = splitRows.length - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const fittingRows = splitRows.slice(0, mid);

        if (pageFits([...currentPage, ...fittingRows], { isFirstPage, includeFooter: false })) {
          bestRowCount = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (bestRowCount <= 0) {
        return null;
      }

      return {
        fittingRows: splitRows.slice(0, bestRowCount),
        remainingRows: splitRows.slice(bestRowCount),
      };
    };

    try {
      const pages: AzeInvoiceRow[][] = [[]];
      let pageIndex = 0;
      const pendingRows = [...tableRows];

      while (pendingRows.length) {
        const row = pendingRows.shift() as AzeInvoiceRow;
        const currentPage = pages[pageIndex];
        const candidatePage = [...currentPage, row];

        if (pageFits(candidatePage, { isFirstPage: pageIndex === 0, includeFooter: false })) {
          currentPage.push(row);
          continue;
        }

        const splitRows = splitAzeInvoiceRowByBullet(row);

        if (splitRows.length > 1) {
          if (currentPage.length === 0) {
            pendingRows.unshift(...splitRows);
            continue;
          }

          const splitPage = splitRowForRemainingPageSpace(row, currentPage, pageIndex === 0);
          if (splitPage) {
            currentPage.push(...splitPage.fittingRows);
            pages.push([]);
            pageIndex += 1;
            pendingRows.unshift(...splitPage.remainingRows);
            continue;
          }
        }

        if (currentPage.length === 0) {
          if (pageIndex === 0) {
            pages.push([]);
            pageIndex += 1;
            pendingRows.unshift(row);
            continue;
          }

          currentPage.push(row);
          continue;
        }

        pages.push([]);
        pageIndex += 1;
        pendingRows.unshift(row);
      }

      while (pages.length > 1 && pages[pages.length - 1].length === 0) {
        pages.pop();
      }

      const pageLayouts: AzeInvoicePageLayout[] = pages.map((rows) => ({
        rows,
        tailBlocks: [],
        includeFooter: false,
      }));
      const summaryPageIndex = pageLayouts.length - 1;
      const summaryLayout = pageLayouts[summaryPageIndex];

      if (
        pageFits(summaryLayout.rows, {
          isFirstPage: summaryPageIndex === 0,
          tailBlocks: [summaryHtml],
          includeFooter: true,
        })
      ) {
        summaryLayout.tailBlocks = [summaryHtml];
        summaryLayout.includeFooter = true;
      } else {
        pageLayouts.push({ rows: [], tailBlocks: [summaryHtml], includeFooter: true });
      }

      if (attachmentTailBlocks.length) {
        pageLayouts.push({ rows: [], tailBlocks: [], includeFooter: false });
        let attachmentPageIndex = pageLayouts.length - 1;

        for (const tailBlock of attachmentTailBlocks) {
          const currentLayout = pageLayouts[attachmentPageIndex];
          const candidateTailBlocks = [...currentLayout.tailBlocks, tailBlock];

          if (
            pageFits(currentLayout.rows, {
              isFirstPage: attachmentPageIndex === 0,
              tailBlocks: candidateTailBlocks,
              includeFooter: false,
            })
          ) {
            currentLayout.tailBlocks.push(tailBlock);
            continue;
          }

          pageLayouts.push({ rows: [], tailBlocks: [tailBlock], includeFooter: false });
          attachmentPageIndex = pageLayouts.length - 1;
        }
      }

      return pageLayouts.length
        ? pageLayouts
        : [{ rows: [], tailBlocks: [summaryHtml], includeFooter: true }];
    } catch {
      const fallbackLayouts: AzeInvoicePageLayout[] = fallbackPages.map((rows) => ({
        rows,
        tailBlocks: [],
        includeFooter: false,
      }));
      fallbackLayouts[fallbackLayouts.length - 1].tailBlocks = [summaryHtml];
      fallbackLayouts[fallbackLayouts.length - 1].includeFooter = true;
      if (attachmentTailBlocks.length) {
        fallbackLayouts.push({ rows: [], tailBlocks: attachmentTailBlocks, includeFooter: false });
      }
      return fallbackLayouts;
    } finally {
      measurementHost.remove();
    }
  };

  const renderedPages = paginateAzeInvoiceRowsByLayout();
  const pagesHtml = renderedPages
    .map((pageLayout, pageIndex) =>
      buildAzeInvoicePageHtml(pageLayout.rows, {
        isFirstPage: pageIndex === 0,
        isLastPage: pageIndex === renderedPages.length - 1,
        tailBlocks: pageLayout.tailBlocks,
        includeFooter: pageLayout.includeFooter,
      }),
    )
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
          html, body { margin: 0; padding: 0; width: 210mm; min-height: 297mm; background: #d9d9d9 !important; font-family: ${azeInvoiceFontFamily}; color: #111111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { background: #d9d9d9 !important; overflow: auto; }
            .page { width: 210mm; height: 297mm; margin: 0; padding: 18mm 16mm 14mm 16mm; background: #d9d9d9 !important; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
            .page-first { padding: 18mm 16mm 16mm 16mm; }
            .page-continue { padding: 14mm 16mm 14mm 16mm; }
            .page:last-child { page-break-after: auto; break-after: auto; }
            .page-main { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
            .page-footer { flex: 0 0 auto; margin-top: auto; padding-top: 6px; break-inside: avoid; page-break-inside: avoid; }
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
          .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
          .job-panel { background: #bfe6e8; min-height: 86px; padding: 12px 16px; display: grid; grid-template-columns: 112px minmax(0, 1fr) minmax(0, 1fr) 112px 112px; gap: 16px; align-items: center; text-align: center; }
          .job-title { font-size: 24px; line-height: 1.05; font-weight: 400; margin: 0; text-align: center; }
          .job-block { margin: 0; width: 100%; min-width: 0; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
          .job-label { font-size: 13px; font-weight: 800; margin-bottom: 6px; }
          .job-value { font-size: 14px; font-weight: 400; line-height: 1.2; word-break: break-word; }
          .main { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
          .table-block { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; width: 100%; overflow: hidden; }
          .table-block-continue { flex: 0 0 auto; }
          .table { width: 100%; }
          .aze-invoice-table { border-collapse: collapse; table-layout: fixed; }
          .aze-unit-col { width: 72px; }
          .aze-area-col { width: 86px; }
          .aze-service-col { width: 108px; }
          .aze-price-col { width: 108px; }
          .aze-invoice-table th { background: #ff5b5b; color: #ffffff; font-weight: 700; font-size: 13px; line-height: 1.2; text-align: center; height: 58px; padding: 0 10px; }
          .aze-invoice-table td { min-height: 58px; padding: 12px 8px; border-bottom: 2px solid rgba(58, 58, 58, 0.75); vertical-align: middle; }
          .aze-invoice-table .unit,
          .aze-invoice-table .area,
          .aze-invoice-table .service { color: #ff5b5b; font-size: 12px; font-weight: 700; line-height: 1.15; word-break: break-word; text-align: center; }
          .aze-invoice-table .service.is-empty { color: transparent; }
          .aze-invoice-table .desc { color: #2f49a7; font-size: 14px; line-height: 1.45; padding-right: 14px; }
          .aze-invoice-table .desc ul { margin: 0; padding-left: 20px; }
          .aze-invoice-table .desc li + li { margin-top: 4px; }
          .aze-invoice-table .cost { color: #2f49a7; font-size: 14px; font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; text-align: center; }
          .aze-invoice-table .cost.is-empty { color: transparent; }
          .aze-invoice-table .row-continuation .service,
          .aze-invoice-table .row-continuation .cost { padding-top: 0; }
          .aze-invoice-table .row-no-divider .service,
          .aze-invoice-table .row-no-divider .cost { padding-bottom: 0; }
          .aze-invoice-table .row-continuation .desc ul { margin-top: 0; }
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
          .footer-rule { grid-column: 1 / -1; height: 1px; border-top: 1px solid rgba(47, 73, 167, 0.35); }
          .phone-text { display: flex; align-items: center; }
          .attachment-section-start { break-inside: avoid; page-break-inside: avoid; }
          .attachment-heading { margin-top: 12px; padding: 0 0 7px 0; border-bottom: 2px solid #ff5b5b; color: #111111; font-size: 16px; line-height: 1.2; font-weight: 800; break-inside: avoid; page-break-inside: avoid; }
          .attachment-row { flex: 0 0 74mm; height: 74mm; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
          .attachment-page { padding: 14mm 16mm 12mm 16mm; }
          .attachment-section { height: 100%; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
          .attachment-head { flex: 0 0 auto; display: flex; align-items: end; justify-content: space-between; border-bottom: 3px solid #ff5b5b; padding-bottom: 9px; }
          .attachment-head span { color: #ff5b5b; font-size: 13px; font-weight: 800; text-transform: uppercase; }
          .attachment-head strong { color: #111111; font-size: 24px; }
          .attachment-body { flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; }
          .attachment-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); gap: 12px; align-content: stretch; overflow: hidden; }
          .attachment-grid--receipts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .attachment-footer-space { flex: 0 0 10mm; }
          .attachment-card { height: 100%; background: rgba(255, 255, 255, 0.35); border: 1px solid rgba(58, 58, 58, 0.28); display: flex; flex-direction: column; min-height: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
          .attachment-card--empty { background: transparent; border-color: transparent; }
          .attachment-frame { flex: 1 1 auto; min-height: 0; background: #efefef; display: flex; align-items: center; justify-content: center; overflow: hidden; }
          .attachment-frame--empty { background: transparent; }
          .attachment-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .attachment-caption { flex: 0 0 auto; display: grid; gap: 3px; padding: 10px 12px 12px; color: #111111; }
          .attachment-caption--empty { min-height: 48px; padding: 10px 12px 12px; }
          .attachment-caption span { color: #ff5b5b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .attachment-caption strong { color: #2f49a7; font-size: 13px; line-height: 1.25; }
        </style>
      </head>
      <body>${pagesHtml}</body>
    </html>
  `;
};

const paginateToddInvoiceRows = (rows: AzeInvoiceRow[]) => {
  if (!rows.length) return [[]];

  const pages: AzeInvoiceRow[][] = [[]];
  const pageLimitFor = (pageIndex: number) => (pageIndex === 0 ? 15.8 : 19.2);
  const summaryUnits = 2.8;
  let pageIndex = 0;
  let usedUnits = 0;

  rows.forEach((row) => {
    const rowUnits = estimateAzeInvoiceRowUnits(row);
    const pageLimit = pageLimitFor(pageIndex);
    const currentPage = pages[pageIndex];

    if (currentPage.length > 0 && usedUnits + rowUnits > pageLimit) {
      pages.push([]);
      pageIndex += 1;
      usedUnits = 0;
    }

    pages[pageIndex].push(row);
    usedUnits += rowUnits;
  });

  if (pages[pageIndex].length > 0 && usedUnits + summaryUnits > pageLimitFor(pageIndex)) {
    pages.push([]);
  }

  return pages.length ? pages : [[]];
};

const buildToddModernInvoiceHtml = (data: AzeInvoiceData) => {
  const tableRows = buildAzeInvoiceTableRows(data.selectedItems);
  const billToHtml = escapeHtml(data.billTo).replace(/\r?\n/g, '<br>');

  const summaryHtml = `
    <section class="summary-wrap">
      <div class="summary">
        <div class="summary-row">
          <span>Job Total</span>
          <strong>${formatPdfMoney(data.jobTotal)}</strong>
        </div>
        <div class="summary-row summary-row-total">
          <span>Total Due</span>
          <strong>${formatPdfMoney(data.totalDue)}</strong>
        </div>
      </div>
    </section>
  `;

  const paymentHtml = `
    <footer class="payment-grid">
      <div>
        <span>Payment Method</span>
        <strong>Payment due upon receipt</strong>
        <small>Please include the invoice number with payment.</small>
      </div>
      <div>
        <span>Contact</span>
        <strong>Home Envy</strong>
        <small>tcgoertler@gmail.com<br>(440) 571-2129</small>
      </div>
      <div>
        <span>Partner</span>
        <strong>All Avenues Realty service partner</strong>
        <small>Thank you for your business.</small>
      </div>
      <div class="signature">
        <strong>Todd Goertler</strong>
        <small>Owner</small>
      </div>
    </footer>
  `;

  const bodyIntroHtml = `
    <section class="body-intro">
      <div class="brand-lockup">
        <span class="home-envy-logo">
          <img class="home-envy-logo-image" src="${escapeHtml(homeEnvyLogoUrl)}" alt="Home Envy logo">
        </span>
        <div class="brand-copy">
          <strong>Home Envy</strong>
          <span>Todd Goertler</span>
          <small>Home Improvement Services</small>
        </div>
      </div>
      <div class="invoice-heading">
        <h1>Invoice</h1>
        <dl>
          <div><dt>Invoice #</dt><dd>${escapeHtml(data.invoiceNumber)}</dd></div>
          <div><dt>Date</dt><dd>${escapeHtml(formatPdfDate(data.docDate))}</dd></div>
        </dl>
      </div>
    </section>
    <section class="client-grid">
      <div>
        <span>Bill To</span>
        <strong>${billToHtml || '-'}</strong>
      </div>
      <div>
        <span>Project</span>
        <strong>${escapeHtml(data.propertyAddress)}</strong>
        <small>${escapeHtml(data.propertyCityLine || 'All Avenues Realty')}</small>
      </div>
      <div>
        <span>Timeline</span>
        <strong>${escapeHtml(formatPdfDate(data.startDate))}</strong>
        <small>Finish ${escapeHtml(formatPdfDate(data.finishDate))}</small>
      </div>
    </section>
  `;

  const toddModernInvoiceLayoutStyles = `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; background: #eceff1 !important; color: #1f2328; font-family: ${pdfTypewriterFontFamily}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { overflow: auto; }
    .page { width: 210mm; height: 297mm; margin: 0; padding: 16mm 14mm 12mm; background: #f7f8f8; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .page-continue { padding-top: 12mm; }
    .sheet-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .body-intro { flex: 0 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 18px 28px; padding-bottom: 15px; border-bottom: 2px solid #1f2328; }
    .brand-lockup { display: flex; align-items: center; gap: 18px; min-width: 0; }
    .home-envy-logo { width: 116px; height: 96px; display: block; flex: 0 0 116px; position: relative; overflow: hidden; }
    .home-envy-logo-image { width: 255px; height: 170px; object-fit: contain; display: block; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
    .brand-copy { display: grid; gap: 4px; }
    .brand-copy strong { display: block; color: #1f2328; font-size: 27px; line-height: 1; letter-spacing: 0; }
    .brand-copy span { display: block; color: #1f2328; font-size: 17px; line-height: 1.05; font-weight: 800; }
    .brand-copy small { display: block; color: #58636f; font-size: 12px; line-height: 1.15; font-weight: 700; }
    .invoice-heading { text-align: right; min-width: 190px; }
    .invoice-heading h1 { margin: 0 0 4px; color: #1f2328; font-size: 46px; line-height: 0.95; font-weight: 800; letter-spacing: 0; }
    .invoice-heading dl { margin: 0; display: grid; justify-content: end; gap: 3px; }
    .invoice-heading div { display: grid; grid-template-columns: auto 84px; gap: 9px; align-items: baseline; }
    .invoice-heading dt { margin: 0; color: #4f5963; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .invoice-heading dd { margin: 0; color: #1f2328; font-size: 12px; text-align: left; font-variant-numeric: tabular-nums; }
    .client-grid { flex: 0 0 auto; display: grid; grid-template-columns: 1fr 1.25fr 0.72fr; gap: 18px; padding-top: 15px; margin-bottom: 14px; }
    .client-grid div { min-height: 54px; padding: 0 11px; border-left: 3px solid #9aa5af; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .client-grid span { display: block; color: #4f5963; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
    .client-grid strong { display: block; color: #1f2328; font-size: 13px; line-height: 1.25; }
    .client-grid small { display: block; color: #58636f; font-size: 11px; line-height: 1.3; margin-top: 3px; }
    .todd-invoice-table { width: 94%; margin: 0 auto; border-collapse: collapse; table-layout: fixed; background: transparent; }
    .todd-invoice-table .aze-unit-col { width: 72px; }
    .todd-invoice-table .aze-area-col { width: 86px; }
    .todd-invoice-table .aze-service-col { width: 108px; }
    .todd-invoice-table .aze-price-col { width: 108px; }
    .todd-invoice-table th { height: 38px; padding: 0 8px; border-bottom: 2px solid #1f2328; color: #1f2328; font-size: 11px; line-height: 1.2; text-align: center; text-transform: uppercase; font-weight: 800; }
    .todd-invoice-table td { padding: 9px 8px; border-bottom: 1px solid #b8c0c8; border-right: 1px solid #c9d0d7; vertical-align: middle; text-align: center; }
    .todd-invoice-table td:last-child, .todd-invoice-table th:last-child { border-right: 0; }
    .todd-invoice-table .unit,
    .todd-invoice-table .area,
    .todd-invoice-table .service { color: #1f2328; font-size: 10px; font-weight: 800; line-height: 1.18; text-align: center; word-break: break-word; }
    .todd-invoice-table .service.is-empty { color: transparent; }
    .todd-invoice-table .desc { color: #343b43; font-size: 11px; line-height: 1.35; text-align: left; }
    .todd-invoice-table .desc ul { margin: 0; padding-left: 16px; list-style-position: outside; }
    .todd-invoice-table .desc li + li { margin-top: 3px; }
    .todd-invoice-table .cost { color: #1f2328; font-size: 11px; font-weight: 800; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .todd-invoice-table .cost.is-empty { color: transparent; }
    .todd-invoice-table .row-continuation .service,
    .todd-invoice-table .row-continuation .cost { padding-top: 0; }
    .todd-invoice-table .row-no-divider .service,
    .todd-invoice-table .row-no-divider .cost { padding-bottom: 0; }
    .summary-wrap { flex: 0 0 auto; width: 94%; display: flex; justify-content: flex-end; margin: 12px auto 0; border-top: 2px solid #1f2328; padding-top: 9px; break-inside: avoid; page-break-inside: avoid; }
    .summary { width: 260px; display: grid; gap: 0; }
    .summary-row { display: grid; grid-template-columns: 1fr 110px; min-height: 27px; align-items: center; border-bottom: 1px solid #c3cbd3; color: #343b43; font-size: 11px; }
    .summary-row span { padding-right: 12px; text-align: center; }
    .summary-row strong { color: #1f2328; text-align: center; font-variant-numeric: tabular-nums; }
    .summary-row-muted span,
    .summary-row-muted strong { color: #69737f; }
    .summary-row-total { margin-top: 5px; min-height: 34px; border-bottom: 0; background: #1f2328; color: #ffffff; padding: 0 10px; }
    .summary-row-total strong,
    .summary-row-total span { color: #ffffff; }
    .attachment-section-start { flex: 0 0 auto; margin-top: 14px; break-inside: avoid; page-break-inside: avoid; }
    .attachment-heading { padding: 0 0 7px 0; border-bottom: 2px solid #1f2328; color: #1f2328; font-size: 13px; line-height: 1.2; font-weight: 800; text-transform: uppercase; break-inside: avoid; page-break-inside: avoid; }
    .attachment-row { flex: 0 0 72mm; height: 72mm; width: 94%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px auto 0; break-inside: avoid; page-break-inside: avoid; }
    .attachment-card { height: 100%; background: rgba(255, 255, 255, 0.5); border: 1px solid #b8c0c8; display: flex; flex-direction: column; min-height: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
    .attachment-card--empty { background: transparent; border-color: transparent; }
    .attachment-frame { flex: 1 1 auto; min-height: 0; background: #eceff1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .attachment-frame--empty { background: transparent; }
    .attachment-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .attachment-caption { flex: 0 0 auto; display: grid; gap: 3px; padding: 9px 11px 10px; color: #1f2328; }
    .attachment-caption--empty { min-height: 42px; padding: 9px 11px 10px; }
    .attachment-caption span { color: #69737f; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .attachment-caption strong { color: #1f2328; font-size: 11px; line-height: 1.25; }
    .payment-grid { flex: 0 0 auto; display: grid; grid-template-columns: 1fr 1fr 1fr 130px; gap: 16px; padding-top: 14px; margin-top: 10px; border-top: 1px solid #b8c0c8; color: #343b43; text-align: left; align-items: start; break-inside: avoid; page-break-inside: avoid; }
    .payment-grid span { display: block; color: #69737f; font-size: 9px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
    .payment-grid strong { display: block; color: #1f2328; font-size: 11px; line-height: 1.25; }
    .payment-grid small { display: block; color: #58636f; font-size: 9px; line-height: 1.35; margin-top: 3px; }
    .signature { display: flex; min-height: 58px; flex-direction: column; justify-content: flex-end; align-items: flex-end; text-align: right; position: relative; }
    .signature::before { content: ""; position: absolute; right: 0; bottom: 28px; width: 112px; height: 1px; background: #1f2328; transform: rotate(-8deg); transform-origin: right center; }
    .signature strong { font-size: 12px; }
  `;

  const buildPageHtml = (
    pageRows: AzeInvoiceRow[],
    options: { isFirstPage: boolean; tailBlocks?: string[]; includeFooter: boolean },
  ) => `
    <div class="page ${options.isFirstPage ? 'page-first' : 'page-continue'}">
      <main class="sheet-body">
        ${options.isFirstPage ? bodyIntroHtml : ''}
        ${
          pageRows.length
            ? `
              <table class="todd-invoice-table">
                ${azeInvoiceTableColumnsHtml}
                ${options.isFirstPage ? azeInvoiceTableHeadHtml : ''}
                <tbody>${buildAzeInvoiceRowsHtml(pageRows)}</tbody>
              </table>
            `
            : ''
        }
        ${options.tailBlocks?.join('') ?? ''}
      </main>
      ${options.includeFooter ? paymentHtml : ''}
    </div>
  `;

  type ToddInvoicePageLayout = {
    rows: AzeInvoiceRow[];
    tailBlocks: string[];
    includeFooter: boolean;
  };

  const paginateToddInvoiceRowsByLayout = () => {
    const attachmentTailBlocks = buildAttachmentTailBlocks(data.attachments);

    if (!tableRows.length) {
      return [
        { rows: [], tailBlocks: [summaryHtml], includeFooter: true },
        ...(attachmentTailBlocks.length
          ? [{ rows: [], tailBlocks: attachmentTailBlocks, includeFooter: false }]
          : []),
      ];
    }

    const fallbackPages = paginateToddInvoiceRows(tableRows);

    if (typeof document === 'undefined') {
      const fallbackLayouts: ToddInvoicePageLayout[] = fallbackPages.map((rows) => ({
        rows,
        tailBlocks: [],
        includeFooter: false,
      }));
      fallbackLayouts[fallbackLayouts.length - 1].tailBlocks = [summaryHtml];
      fallbackLayouts[fallbackLayouts.length - 1].includeFooter = true;
      if (attachmentTailBlocks.length) {
        fallbackLayouts.push({ rows: [], tailBlocks: attachmentTailBlocks, includeFooter: false });
      }
      return fallbackLayouts;
    }

    const measurementHost = document.createElement('div');
    Object.assign(measurementHost.style, {
      position: 'fixed',
      left: '-250vw',
      top: '0',
      width: '210mm',
      minHeight: '297mm',
      visibility: 'hidden',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.body.appendChild(measurementHost);
    const measurementRoot = measurementHost.attachShadow({ mode: 'open' });

    const pageFits = (
      pageRows: AzeInvoiceRow[],
      options: { isFirstPage: boolean; tailBlocks?: string[]; includeFooter: boolean },
    ) => {
      measurementRoot.innerHTML = `
        <style>${toddModernInvoiceLayoutStyles}</style>
        ${buildPageHtml(pageRows, {
          isFirstPage: options.isFirstPage,
          tailBlocks: options.tailBlocks,
          includeFooter: options.includeFooter,
        })}
      `;

      const body = measurementRoot.querySelector<HTMLElement>('.sheet-body');
      if (!body) {
        return true;
      }

      const measuredElements = Array.from(
        measurementRoot.querySelectorAll<HTMLElement>(
          '.body-intro, .client-grid, .todd-invoice-table, .summary-wrap, .attachment-section-start, .attachment-row',
        ),
      );

      if (!measuredElements.length) {
        return true;
      }

      const bodyBottom = body.getBoundingClientRect().bottom;
      const contentBottom = Math.max(
        ...measuredElements.map((element) => element.getBoundingClientRect().bottom),
      );

      return contentBottom <= bodyBottom + 0.5;
    };

    const splitRowForRemainingPageSpace = (
      row: AzeInvoiceRow,
      currentPage: AzeInvoiceRow[],
      isFirstPage: boolean,
    ) => {
      const splitRows = splitAzeInvoiceRowByBullet(row);
      if (splitRows.length <= 1) {
        return null;
      }

      let bestRowCount = 0;
      let low = 1;
      let high = splitRows.length - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const fittingRows = splitRows.slice(0, mid);

        if (pageFits([...currentPage, ...fittingRows], { isFirstPage, includeFooter: false })) {
          bestRowCount = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (bestRowCount <= 0) {
        return null;
      }

      return {
        fittingRows: splitRows.slice(0, bestRowCount),
        remainingRows: splitRows.slice(bestRowCount),
      };
    };

    try {
      const pages: AzeInvoiceRow[][] = [[]];
      let pageIndex = 0;
      const pendingRows = [...tableRows];

      while (pendingRows.length) {
        const row = pendingRows.shift() as AzeInvoiceRow;
        const currentPage = pages[pageIndex];
        const candidatePage = [...currentPage, row];

        if (pageFits(candidatePage, { isFirstPage: pageIndex === 0, includeFooter: false })) {
          currentPage.push(row);
          continue;
        }

        const splitRows = splitAzeInvoiceRowByBullet(row);

        if (splitRows.length > 1) {
          if (currentPage.length === 0) {
            pendingRows.unshift(...splitRows);
            continue;
          }

          const splitPage = splitRowForRemainingPageSpace(row, currentPage, pageIndex === 0);
          if (splitPage) {
            currentPage.push(...splitPage.fittingRows);
            pages.push([]);
            pageIndex += 1;
            pendingRows.unshift(...splitPage.remainingRows);
            continue;
          }
        }

        if (currentPage.length === 0) {
          if (pageIndex === 0) {
            pages.push([]);
            pageIndex += 1;
            pendingRows.unshift(row);
            continue;
          }

          currentPage.push(row);
          continue;
        }

        pages.push([]);
        pageIndex += 1;
        pendingRows.unshift(row);
      }

      while (pages.length > 1 && pages[pages.length - 1].length === 0) {
        pages.pop();
      }

      const pageLayouts: ToddInvoicePageLayout[] = pages.map((rows) => ({
        rows,
        tailBlocks: [],
        includeFooter: false,
      }));
      let summaryPageIndex = pageLayouts.length - 1;
      const summaryLayout = pageLayouts[summaryPageIndex];

      if (
        pageFits(summaryLayout.rows, {
          isFirstPage: summaryPageIndex === 0,
          tailBlocks: [summaryHtml],
          includeFooter: true,
        })
      ) {
        summaryLayout.tailBlocks = [summaryHtml];
        summaryLayout.includeFooter = true;
      } else {
        pageLayouts.push({ rows: [], tailBlocks: [summaryHtml], includeFooter: true });
        summaryPageIndex = pageLayouts.length - 1;
      }

      if (attachmentTailBlocks.length) {
        pageLayouts.push({ rows: [], tailBlocks: [], includeFooter: false });
        let attachmentPageIndex = pageLayouts.length - 1;

        for (const tailBlock of attachmentTailBlocks) {
          const currentLayout = pageLayouts[attachmentPageIndex];
          const candidateTailBlocks = [...currentLayout.tailBlocks, tailBlock];

          if (
            pageFits(currentLayout.rows, {
              isFirstPage: attachmentPageIndex === 0,
              tailBlocks: candidateTailBlocks,
              includeFooter: false,
            })
          ) {
            currentLayout.tailBlocks.push(tailBlock);
            continue;
          }

          pageLayouts.push({ rows: [], tailBlocks: [tailBlock], includeFooter: false });
          attachmentPageIndex = pageLayouts.length - 1;
        }
      }

      return pageLayouts.length
        ? pageLayouts
        : [{ rows: [], tailBlocks: [summaryHtml], includeFooter: true }];
    } catch {
      const fallbackLayouts: ToddInvoicePageLayout[] = fallbackPages.map((rows) => ({
        rows,
        tailBlocks: [],
        includeFooter: false,
      }));
      fallbackLayouts[fallbackLayouts.length - 1].tailBlocks = [summaryHtml];
      fallbackLayouts[fallbackLayouts.length - 1].includeFooter = true;
      if (attachmentTailBlocks.length) {
        fallbackLayouts.push({ rows: [], tailBlocks: attachmentTailBlocks, includeFooter: false });
      }
      return fallbackLayouts;
    } finally {
      measurementHost.remove();
    }
  };

  const renderedPages = paginateToddInvoiceRowsByLayout();
  const pagesHtml = renderedPages
    .map((pageLayout, pageIndex) =>
      buildPageHtml(pageLayout.rows, {
        isFirstPage: pageIndex === 0,
        tailBlocks: pageLayout.tailBlocks,
        includeFooter: pageLayout.includeFooter,
      }),
    )
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
        <style>${toddModernInvoiceLayoutStyles}</style>
      </head>
      <body>${pagesHtml}</body>
    </html>
  `;
};

const splitLongSterlingInvoiceLine = (value: string) => {
  const maxLength = 170;

  if (value.length <= maxLength) {
    return [value];
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [value];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  words.forEach((word) => {
    if (word.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }

      return;
    }

    const candidateChunk = currentChunk ? `${currentChunk} ${word}` : word;

    if (candidateChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = word;
      return;
    }

    currentChunk = candidateChunk;
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length ? chunks : [value];
};

const estimateSterlingInvoiceRowUnits = (row: SterlingInvoiceRow) => {
  const unitLines = Math.max(1, Math.ceil(row.unit.length / 14));
  const areaLines = Math.max(1, Math.ceil(row.area.length / 16));
  const serviceLines = Math.max(1, Math.ceil(row.service.length / 16));
  const descriptionLines = row.descriptionLines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / 58)),
    0,
  );

  return 0.92 + Math.max(unitLines, areaLines, serviceLines) * 0.18 + descriptionLines * 0.58;
};

const flattenSterlingDescriptionGroups = (groups: string[][]) => groups.flat();

const getSterlingDescriptionGroups = (row: Pick<SterlingInvoiceRow, 'descriptionLines' | 'descriptionLineGroups'>) =>
  row.descriptionLineGroups.length ? row.descriptionLineGroups : [row.descriptionLines];

const sliceSterlingDescriptionGroups = (groups: string[][], lineCount: number) => {
  const chunkGroups: string[][] = [];
  const remainingGroups: string[][] = [];
  let remainingLineCount = lineCount;

  groups.forEach((group) => {
    if (remainingLineCount <= 0) {
      remainingGroups.push(group);
      return;
    }

    if (group.length <= remainingLineCount) {
      chunkGroups.push(group);
      remainingLineCount -= group.length;
      return;
    }

    chunkGroups.push(group.slice(0, remainingLineCount));
    remainingGroups.push(group.slice(remainingLineCount));
    remainingLineCount = 0;
  });

  return {
    chunkGroups: chunkGroups.filter((group) => group.length),
    remainingGroups: remainingGroups.filter((group) => group.length),
  };
};

const buildSterlingRowWithDescriptionGroups = (
  row: SterlingInvoiceRow,
  descriptionLineGroups: string[][],
) => ({
  ...row,
  descriptionLineGroups,
  descriptionLines: flattenSterlingDescriptionGroups(descriptionLineGroups),
});

const getSterlingDescriptionBoundaryLineCounts = (groups: string[][]) => {
  let lineCount = 0;

  return groups
    .map((group) => {
      lineCount += group.length;
      return lineCount;
    })
    .filter((count) => count > 0);
};

const splitSterlingInvoiceRow = (row: SterlingInvoiceRow) => {
  const descriptionLineGroups = getSterlingDescriptionGroups(row)
    .map((group) => group.flatMap(splitLongSterlingInvoiceLine).filter(Boolean))
    .filter((group) => group.length);
  const normalizedRow = {
    ...row,
    descriptionLineGroups: descriptionLineGroups.length ? descriptionLineGroups : [['-']],
  };

  return [buildSterlingRowWithDescriptionGroups(normalizedRow, normalizedRow.descriptionLineGroups)];
};

const buildSterlingInvoiceTableRows = (items: PdfServiceItem[]): SterlingInvoiceRow[] =>
  [...items]
    .sort(
      (left, right) =>
        compareInvoiceCells(displayInvoiceCell(left.unit), displayInvoiceCell(right.unit)) ||
        compareInvoiceCells(displayInvoiceCell(left.area), displayInvoiceCell(right.area)) ||
        compareInvoiceCells(displayInvoiceCell(left.service, 'General Service'), displayInvoiceCell(right.service, 'General Service')) ||
        invoiceCellCollator.compare(left.description, right.description),
    )
    .flatMap((item) => {
      const descriptionLineGroups = item.description
        .split(/\r?\n\s*\r?\n+/)
        .map((group) =>
          group
            .split(/\r?\n+/)
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .flatMap(splitLongSterlingInvoiceLine),
        )
        .filter((group) => group.length);
      const normalizedDescriptionLineGroups = descriptionLineGroups.length ? descriptionLineGroups : [['-']];
      const baseRow: SterlingInvoiceRow = {
        unit: displayInvoiceCell(item.unit),
        area: displayInvoiceCell(item.area),
        service: displayInvoiceCell(item.service, 'General Service'),
        descriptionLines: flattenSterlingDescriptionGroups(normalizedDescriptionLineGroups),
        descriptionLineGroups: normalizedDescriptionLineGroups,
        labor: item.labor,
        unitPrice: item.unitPrice,
        showDetails: true,
        showMoney: true,
        showDivider: true,
      };

      return splitSterlingInvoiceRow(baseRow);
    });

const buildSterlingInvoiceDisplayRows = (rows: SterlingInvoiceRow[]): SterlingInvoiceDisplayRow[] => {
  const displayRows: SterlingInvoiceDisplayRow[] = rows.map((row) => ({
    ...row,
    showUnitCell: false,
    unitRowSpan: 1,
    showAreaCell: false,
    areaRowSpan: 1,
    showServiceCell: false,
    serviceRowSpan: 1,
  }));

  for (let unitStart = 0; unitStart < displayRows.length;) {
    const unit = displayRows[unitStart].unit;
    let unitEnd = unitStart + 1;

    while (unitEnd < displayRows.length && displayRows[unitEnd].unit === unit) {
      unitEnd += 1;
    }

    displayRows[unitStart].showUnitCell = true;
    displayRows[unitStart].unitRowSpan = unitEnd - unitStart;

    for (let areaStart = unitStart; areaStart < unitEnd;) {
      const area = displayRows[areaStart].area;
      let areaEnd = areaStart + 1;

      while (areaEnd < unitEnd && displayRows[areaEnd].area === area) {
        areaEnd += 1;
      }

      displayRows[areaStart].showAreaCell = true;
      displayRows[areaStart].areaRowSpan = areaEnd - areaStart;

      for (let serviceStart = areaStart; serviceStart < areaEnd;) {
        const service = displayRows[serviceStart].service;
        let serviceEnd = serviceStart + 1;

        while (serviceEnd < areaEnd && displayRows[serviceEnd].service === service) {
          serviceEnd += 1;
        }

        displayRows[serviceStart].showServiceCell = true;
        displayRows[serviceStart].serviceRowSpan = serviceEnd - serviceStart;
        serviceStart = serviceEnd;
      }

      areaStart = areaEnd;
    }

    unitStart = unitEnd;
  }

  return displayRows;
};

const buildSterlingDescriptionHtml = (lines: string[]) => {
  const normalizedLines = lines.filter(Boolean);

  if (!normalizedLines.length) {
    return '-';
  }

  if (normalizedLines.length === 1) {
    return escapeHtml(normalizedLines[0]);
  }

  return `<div class="description-stack">${normalizedLines
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('')}</div>`;
};

const buildSterlingMechanicalRowsHtml = (rows: SterlingInvoiceRow[]) =>
  buildSterlingInvoiceDisplayRows(rows)
    .map((row, index) => {
      const showDetails = row.showDetails !== false;
      const showMoney = row.showMoney !== false && !row.continuation;
      const rowClass = [
        'invoice-row',
        index > 0 && !row.continuation ? 'invoice-row--separated' : '',
        row.continuation ? 'invoice-row--continuation' : '',
        row.showDivider === false ? 'invoice-row--open' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <tr class="${rowClass}">
          ${
            row.showUnitCell
              ? `<td class="unit-cell" rowspan="${row.unitRowSpan}">${buildInvoiceCellHtml(row.unit)}</td>`
              : ''
          }
          ${
            row.showAreaCell
              ? `<td class="area-cell" rowspan="${row.areaRowSpan}">${buildInvoiceCellHtml(row.area)}</td>`
              : ''
          }
          ${
            row.showServiceCell
              ? `<td class="service-cell${showDetails ? '' : ' continuation-cell'}" rowspan="${row.serviceRowSpan}">${
                  showDetails ? buildInvoiceCellHtml(row.service) : '&nbsp;'
                }</td>`
              : ''
          }
          <td class="description-cell">${buildSterlingDescriptionHtml(row.descriptionLines)}</td>
          <td class="money-cell${showMoney ? '' : ' continuation-cell'}">${showMoney ? formatSterlingTableAmount(row.labor) : '&nbsp;'}</td>
          <td class="money-cell${showMoney ? '' : ' continuation-cell'}">${showMoney ? formatSterlingTableAmount(row.unitPrice) : '&nbsp;'}</td>
        </tr>
      `;
    })
    .join('');

const estimateSterlingRowsUnits = (rows: SterlingInvoiceRow[]) =>
  rows.reduce((sum, row) => sum + estimateSterlingInvoiceRowUnits(row), 0);

const splitSterlingRowForCapacity = (
  row: SterlingInvoiceRow,
  capacityUnits: number,
): { chunk: SterlingInvoiceRow; remaining: SterlingInvoiceRow | null } => {
  const targetUnits = Math.max(1.4, capacityUnits);
  const chunkLines: string[] = [];

  for (const line of row.descriptionLines) {
    const candidateLines = [...chunkLines, line];
    const candidateRow = { ...row, descriptionLines: candidateLines };

    if (chunkLines.length && estimateSterlingInvoiceRowUnits(candidateRow) > targetUnits) {
      break;
    }

    chunkLines.push(line);

    if (estimateSterlingInvoiceRowUnits(candidateRow) > targetUnits) {
      break;
    }
  }

  const safeChunkLines = chunkLines.length ? chunkLines : [row.descriptionLines[0] ?? '-'];
  const { chunkGroups, remainingGroups } = sliceSterlingDescriptionGroups(
    getSterlingDescriptionGroups(row),
    safeChunkLines.length,
  );
  const safeChunkGroups = chunkGroups.length ? chunkGroups : [safeChunkLines];

  return {
    chunk: {
      ...buildSterlingRowWithDescriptionGroups(row, safeChunkGroups),
      showDivider: remainingGroups.length ? false : row.showDivider,
    },
    remaining: remainingGroups.length
      ? {
          ...buildSterlingRowWithDescriptionGroups(row, remainingGroups),
          continuation: true,
          showMoney: false,
          showDivider: row.showDivider,
        }
      : null,
  };
};

const paginateSterlingInvoiceRowsByEstimate = (rows: SterlingInvoiceRow[]) => {
  if (!rows.length) return [[]];

  const pages: SterlingInvoiceRow[][] = [[]];
  const pageCapacityFor = (pageIndex: number) => (pageIndex === 0 ? 17.8 : 26.8);
  let pageIndex = 0;
  let usedUnits = 0;

  const startNextPage = () => {
    pages.push([]);
    pageIndex += 1;
    usedUnits = 0;
  };

  rows.forEach((sourceRow) => {
    let remainingRow: SterlingInvoiceRow | null = sourceRow;

    while (remainingRow) {
      const currentPage = pages[pageIndex];
      const capacity = pageCapacityFor(pageIndex);
      const availableUnits = capacity - usedUnits;
      const rowUnits = estimateSterlingInvoiceRowUnits(remainingRow);

      if (rowUnits <= availableUnits) {
        currentPage.push(remainingRow);
        usedUnits += rowUnits;
        remainingRow = null;
        continue;
      }

      if (currentPage.length) {
        startNextPage();
        continue;
      }

      const { chunk, remaining } = splitSterlingRowForCapacity(remainingRow, capacity);
      currentPage.push(chunk);
      usedUnits += estimateSterlingInvoiceRowUnits(chunk);
      remainingRow = remaining;

      if (remainingRow) {
        startNextPage();
      }
    }
  });

  return pages.length ? pages : [[]];
};

const sterlingMechanicalInvoiceStyles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #111111;
    font-family: ${pdfTypewriterFontFamily};
    font-size: 11px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { overflow: auto; }
  .page {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .ryan-sheet-head {
    flex: 0 0 12mm;
  }
  .page-continue .ryan-sheet-head {
    flex-basis: 11mm;
  }
  .ryan-sheet-foot {
    flex: 0 0 10mm;
  }
  .sterling-invoice-content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0 13mm 3mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .invoice-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 73mm;
    gap: 8mm;
    align-items: center;
    min-height: 46mm;
    padding: 0 2mm 7mm;
    border-bottom: 1.5px solid #111111;
  }
  .invoice-brand {
    display: grid;
    grid-template-columns: auto minmax(0, max-content);
    grid-template-rows: auto auto;
    column-gap: 9mm;
    row-gap: 2.5mm;
    align-items: center;
    justify-content: start;
    justify-items: start;
  }
  .invoice-logo {
    grid-row: 1 / 3;
    width: 31mm;
    height: 31mm;
    object-fit: contain;
    display: block;
  }
  .invoice-title-main {
    margin: 0;
    color: #111111;
    font-size: 32px;
    line-height: 1;
    letter-spacing: 5px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .invoice-number-main {
    margin: 0;
    font-size: 30px;
    line-height: 1;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .invoice-meta {
    display: grid;
    gap: 3mm;
    padding: 0 0 4mm;
    font-size: 13px;
    line-height: 1.15;
  }
  .meta-row {
    display: grid;
    grid-template-columns: 22mm minmax(0, 1fr);
    gap: 4mm;
    align-items: baseline;
  }
  .meta-label {
    font-weight: 800;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .meta-value {
    min-height: 0;
    border-bottom: 0;
    text-align: left;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .meta-value--email {
    font-size: 13px;
    white-space: nowrap;
    word-break: normal;
  }
  .meta-value--address {
    line-height: 1.25;
  }
  .party-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0;
    padding: 9mm 2mm 13mm;
  }
  .party-block {
    min-height: auto;
    padding: 0;
  }
  .party-block + .party-block {
    border-left: 1px solid #b8b8b8;
    padding-left: 12mm;
  }
  .block-title {
    margin: 0 0 3mm;
    font-size: 20px;
    line-height: 1;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .bill-to-content {
    white-space: pre-line;
    line-height: 1.55;
    color: #111111;
    font-size: 18px;
  }
  .address-content {
    white-space: pre-line;
    line-height: 1.55;
    color: #111111;
    font-size: 17px;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .contact-info {
    display: grid;
    gap: 2.8mm;
    font-size: 18px;
    line-height: 1.45;
  }
  .contact-info strong {
    display: inline;
    margin: 0 2mm 0 0;
    font-weight: 800;
  }
  .invoice-table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 0;
    margin: 1mm auto 0;
  }
  .invoice-table col:nth-child(1) { width: 10%; }
  .invoice-table col:nth-child(2) { width: 13%; }
  .invoice-table col:nth-child(3) { width: 17%; }
  .invoice-table col:nth-child(4) { width: 39%; }
  .invoice-table col:nth-child(5) { width: 9%; }
  .invoice-table col:nth-child(6) { width: 12%; }
  .invoice-table th,
  .invoice-table td {
    border: 0;
    padding: 0 3mm;
    vertical-align: top;
    text-align: center;
    color: #111111;
    word-break: normal;
    overflow-wrap: normal;
  }
  .invoice-table th {
    background: #ffffff;
    border-top: 1.5px solid #111111;
    border-bottom: 1.5px solid #111111;
    font-size: 15px;
    line-height: 1.05;
    text-align: center;
    font-weight: 800;
    text-transform: none;
    vertical-align: middle;
    padding: 2mm;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .invoice-table td {
    padding-top: 7mm;
    padding-bottom: 2mm;
    font-size: 15px;
    line-height: 1.5;
  }
  .invoice-row {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .invoice-row--open td { border-bottom-color: transparent; }
  .invoice-row--continuation td { padding-top: 2mm; }
  .invoice-table td.unit-cell,
  .invoice-table td.area-cell,
  .invoice-table td.service-cell,
  .invoice-table td.money-cell {
    vertical-align: middle;
    text-align: center;
  }
  .invoice-row--separated .description-cell,
  .invoice-row--separated .money-cell {
    border-top: 1px solid #111111;
  }
  .invoice-table td.description-cell {
    text-align: left;
    padding-left: 2mm;
    padding-right: 4mm;
    vertical-align: top;
  }
  .invoice-table td.description-cell .description-stack,
  .invoice-table td.description-cell .description-stack div {
    text-align: left;
  }
  .description-stack {
    display: grid;
    gap: 2mm;
    justify-items: stretch;
    text-align: left;
  }
  .continuation-cell {
    color: transparent;
  }
  .money-cell {
    text-align: center;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .unit-price-head {
    white-space: normal;
  }
  .unit-price-head span {
    display: block;
    white-space: nowrap;
  }
  .continue-head {
    display: flex;
    justify-content: space-between;
    gap: 10mm;
    align-items: end;
    margin-bottom: 5mm;
    padding-bottom: 3.5mm;
    border-bottom: 1px solid #111111;
  }
  .continue-head strong {
    font-size: 18px;
    text-transform: uppercase;
  }
  .continue-meta {
    font-size: 10px;
    text-align: right;
    line-height: 1.5;
  }
  .last-section {
    margin-top: 16mm;
    padding-top: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 82mm;
    gap: 17mm;
    align-items: start;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .observation-box {
    min-height: 28mm;
    border: 0;
    padding: 0;
  }
  .observation-box .block-title {
    text-transform: none;
    font-size: 20px;
    margin-bottom: 7mm;
  }
  .observation-text {
    min-height: 13mm;
    border: 1.2px solid #111111;
    padding: 3mm;
    white-space: pre-line;
    line-height: 1.45;
    font-size: 14px;
  }
  .totals-panel {
    padding-top: 0;
  }
  .total-line {
    display: grid;
    grid-template-columns: 1fr 31mm;
    min-height: 12.5mm;
    align-items: center;
    border-bottom: 1px solid #c9c9c9;
    font-size: 18px;
  }
  .total-line span {
    padding: 0 1mm;
  }
  .total-line span:first-child {
    font-weight: 800;
  }
  .total-line span:last-child {
    text-align: right;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .total-line.total {
    margin-top: 3mm;
    border-top: 2px solid #111111;
    border-bottom: 0;
    min-height: 13mm;
    font-size: 21px;
    font-weight: 800;
  }
  .total-line.total span:last-child {
    font-weight: 800;
  }
  .footer-note {
    margin-top: 20mm;
    text-align: center;
    font-size: 21px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: uppercase;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .attachment-section-start {
    flex: 0 0 auto;
    margin-top: 7mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .attachment-heading {
    padding: 0 0 3mm;
    border-bottom: 1.5px solid #111111;
    color: #111111;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 800;
    text-transform: uppercase;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .attachment-row {
    flex: 0 0 76mm;
    height: 76mm;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10mm;
    margin-top: 5mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .attachment-card {
    height: 100%;
    background: #ffffff;
    border: 1px solid #111111;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .attachment-card--empty {
    background: transparent;
    border-color: transparent;
  }
  .attachment-frame {
    flex: 1 1 auto;
    min-height: 0;
    background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .attachment-frame--empty { background: transparent; }
  .attachment-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .attachment-caption {
    flex: 0 0 auto;
    display: grid;
    gap: 2px;
    padding: 8px 10px 10px;
    color: #111111;
  }
  .attachment-caption--empty {
    min-height: 40px;
    padding: 8px 10px 10px;
  }
  .attachment-caption span {
    color: #111111;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .attachment-caption strong {
    color: #111111;
    font-size: 11px;
    line-height: 1.25;
  }
`;

const buildSterlingMechanicalInvoiceHtml = (data: SterlingMechanicalInvoiceData) => {
  const tableRows = buildSterlingInvoiceTableRows(data.selectedItems);
  const attachmentTailBlocks = buildAttachmentTailBlocks(data.attachments);
  const billToHtml = escapeHtml(data.billTo.trim()).replace(/\r?\n/g, '<br>');
  const observationHtml = escapeHtml(data.observation.trim()).replace(/\r?\n/g, '<br>');
  const tableColumnsHtml = `
    <colgroup>
      <col />
      <col />
      <col />
      <col />
      <col />
      <col />
    </colgroup>
  `;
  const tableHeadHtml = `
    <thead>
      <tr>
        <th>Unit</th>
        <th>Area</th>
        <th>Service</th>
        <th>Description</th>
        <th>Labor</th>
        <th>Unit Price</th>
      </tr>
    </thead>
  `;
  const summarySectionHtml = `
    <section class="last-section">
      <div class="observation-box">
        <p class="block-title">Observation:</p>
        <div class="observation-text">${observationHtml}</div>
      </div>
      <div>
        <div class="totals-panel">
          <div class="total-line">
            <span>Labor Total</span>
            <span>${formatPdfMoney(data.laborTotal)}</span>
          </div>
          <div class="total-line">
            <span>Job Total</span>
            <span>${formatPdfMoney(data.jobTotal)}</span>
          </div>
          <div class="total-line">
            <span>Expenses</span>
            <span>${formatPdfMoney(data.expenses)}</span>
          </div>
          <div class="total-line">
            <span>Invoicing Services</span>
            <span>${formatPdfMoney(data.invoicingServices)}</span>
          </div>
          <div class="total-line total">
            <span>Total Due</span>
            <span>${formatPdfMoney(data.totalDue)}</span>
          </div>
        </div>
      </div>
    </section>
  `;
  const footerNoteHtml = '<div class="footer-note">THANK YOU FOR YOUR TRUST!</div>';
  const summaryHtml = `${summarySectionHtml}${footerNoteHtml}`;

  type SterlingMechanicalPageLayout = {
    rows: SterlingInvoiceRow[];
    tailBlocks: string[];
  };

  const buildPageHtml = (
    rows: SterlingInvoiceRow[],
    options: { isFirstPage: boolean; tailBlocks?: string[] },
  ) => {
    const rowsHtml = rows.length ? buildSterlingMechanicalRowsHtml(rows) : '';
    const tableHtml = rowsHtml
      ? `
        <table class="invoice-table">
          ${tableColumnsHtml}
          ${options.isFirstPage ? tableHeadHtml : ''}
          <tbody>${rowsHtml}</tbody>
        </table>
      `
      : '';
    const tailBlocksHtml = options.tailBlocks?.join('') ?? '';
    const pageClassName = ['page', options.isFirstPage ? 'page-first' : 'page-continue'].join(' ');

    return `
      <div class="${pageClassName}">
        <div class="ryan-sheet-head" aria-hidden="true"></div>

        <main class="sterling-invoice-content">
          ${
            options.isFirstPage
              ? `
                <div class="invoice-top">
                  <div class="invoice-brand">
                    <img class="invoice-logo" src="${escapeHtml(ryanLogoUrl)}" alt="Ryan Goertler logo">
                    <h1 class="invoice-title-main">INVOICE</h1>
                    <p class="invoice-number-main">Nro. ${escapeHtml(data.invoiceNumber)}</p>
                  </div>
                  <div class="invoice-meta">
                    <div class="meta-row">
                      <span class="meta-label">Date:</span>
                      <span class="meta-value">${escapeHtml(formatPdfDate(data.docDate))}</span>
                    </div>
                    <div class="meta-row">
                      <span class="meta-label">Email:</span>
                      <span class="meta-value meta-value--email">ryangoertler1313@gmail.com</span>
                    </div>
                    <div class="meta-row">
                      <span class="meta-label">Main:</span>
                      <span class="meta-value">(440) 289-9796</span>
                    </div>
                    <div class="meta-row">
                      <span class="meta-label">Secondary:</span>
                      <span class="meta-value">(440) 666-5608</span>
                    </div>
                    <div class="meta-row">
                      <span class="meta-label">Address:</span>
                      <span class="meta-value meta-value--address">15222 Saranac Rd, Cleveland,<br>OH 44110</span>
                    </div>
                  </div>
                </div>

                <section class="party-grid">
                  <div class="party-block">
                    <p class="block-title">Bill To:</p>
                    <div class="bill-to-content">${billToHtml}</div>
                  </div>
                  <div class="party-block">
                    <p class="block-title">Property:</p>
                    <div class="address-content">${escapeHtml(data.propertyName.trim() || '-')}</div>
                  </div>
                </section>
              `
              : ''
          }

          ${tableHtml}
          ${tailBlocksHtml}
        </main>

        <div class="ryan-sheet-foot" aria-hidden="true"></div>
      </div>
    `;
  };

  const paginateSterlingInvoiceRowsByLayout = () => {
    const estimatedPages = paginateSterlingInvoiceRowsByEstimate(tableRows);

    const buildFallbackLayouts = () => {
      const pageLayouts: SterlingMechanicalPageLayout[] = estimatedPages.map((rows) => ({
        rows,
        tailBlocks: [],
      }));

      if (!pageLayouts.length) {
        pageLayouts.push({ rows: [], tailBlocks: [] });
      }

      const summaryUnits = 6.6;
      const summaryCapacityFor = (pageIndex: number) => (pageIndex === 0 ? 10.8 : 22.5);
      const lastPageIndex = pageLayouts.length - 1;
      const lastLayout = pageLayouts[lastPageIndex];

      if (estimateSterlingRowsUnits(lastLayout.rows) + summaryUnits <= summaryCapacityFor(lastPageIndex)) {
        lastLayout.tailBlocks = [summaryHtml];
      } else {
        pageLayouts.push({ rows: [], tailBlocks: [summaryHtml] });
      }

      if (attachmentTailBlocks.length) {
        for (let index = 0; index < attachmentTailBlocks.length; index += 2) {
          pageLayouts.push({ rows: [], tailBlocks: attachmentTailBlocks.slice(index, index + 2) });
        }
      }

      return pageLayouts.filter((layout) => layout.rows.length || layout.tailBlocks.length);
    };

    const fallbackLayouts = buildFallbackLayouts();

    if (typeof document === 'undefined') {
      return fallbackLayouts;
    }

    const measurementHost = document.createElement('div');
    Object.assign(measurementHost.style, {
      position: 'fixed',
      left: '-250vw',
      top: '0',
      width: '210mm',
      minHeight: '297mm',
      visibility: 'hidden',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.body.appendChild(measurementHost);
    const measurementRoot = measurementHost.attachShadow({ mode: 'open' });

    const pageFits = (
      rows: SterlingInvoiceRow[],
      options: { isFirstPage: boolean; tailBlocks?: string[] },
    ) => {
      measurementRoot.innerHTML = `
        <style>${sterlingMechanicalInvoiceStyles}</style>
        ${buildPageHtml(rows, {
          isFirstPage: options.isFirstPage,
          tailBlocks: options.tailBlocks,
        })}
      `;

      const body = measurementRoot.querySelector<HTMLElement>('.sterling-invoice-content');
      if (!body) {
        return true;
      }

      const measuredElements = Array.from(
        measurementRoot.querySelectorAll<HTMLElement>(
          '.invoice-table, .last-section, .footer-note, .attachment-section-start, .attachment-row',
        ),
      );

      if (!measuredElements.length) {
        return true;
      }

      const bodyBottom = body.getBoundingClientRect().bottom;
      const contentBottom = Math.max(
        ...measuredElements.map((element) => element.getBoundingClientRect().bottom),
      );

      return contentBottom <= bodyBottom + 0.5;
    };

    const splitRowForPage = (
      row: SterlingInvoiceRow,
      isFirstPage: boolean,
      currentPage: SterlingInvoiceRow[] = [],
    ): { chunk: SterlingInvoiceRow; remaining: SterlingInvoiceRow | null } => {
      let bestLineCount = 0;
      let low = 1;
      let high = row.descriptionLines.length;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const isCompleteRow = mid >= row.descriptionLines.length;
        const candidateChunk: SterlingInvoiceRow = {
          ...row,
          descriptionLines: row.descriptionLines.slice(0, mid),
          showDivider: isCompleteRow ? row.showDivider : false,
        };

        if (pageFits([...currentPage, candidateChunk], { isFirstPage })) {
          bestLineCount = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (bestLineCount <= 0) {
        return { chunk: row, remaining: null };
      }

      const descriptionLineGroups = getSterlingDescriptionGroups(row);
      const totalLineCount = row.descriptionLines.length;
      const boundaryLineCounts = getSterlingDescriptionBoundaryLineCounts(descriptionLineGroups);
      const splitsInsideDescription =
        bestLineCount < totalLineCount && !boundaryLineCounts.includes(bestLineCount);
      const preferredBoundaryLineCount = splitsInsideDescription
        ? [...boundaryLineCounts].reverse().find((count) => count <= bestLineCount && count < totalLineCount)
        : undefined;
      const finalLineCount = preferredBoundaryLineCount && preferredBoundaryLineCount > 0
        ? preferredBoundaryLineCount
        : bestLineCount;
      const { chunkGroups, remainingGroups } = sliceSterlingDescriptionGroups(
        descriptionLineGroups,
        finalLineCount,
      );
      const isCompleteRow = remainingGroups.length === 0;

      return {
        chunk: {
          ...buildSterlingRowWithDescriptionGroups(row, chunkGroups),
          showDivider: isCompleteRow ? row.showDivider : false,
        },
        remaining: isCompleteRow
          ? null
          : {
            ...buildSterlingRowWithDescriptionGroups(row, remainingGroups),
            continuation: true,
            showMoney: false,
            showDivider: row.showDivider,
          },
      };
    };

    try {
      const pages: SterlingInvoiceRow[][] = [[]];
      let pageIndex = 0;
      const pendingRows = [...tableRows];

      const startNextPage = () => {
        pages.push([]);
        pageIndex += 1;
      };

      while (pendingRows.length) {
        const row = pendingRows.shift() as SterlingInvoiceRow;
        const currentPage = pages[pageIndex];
        const candidatePage = [...currentPage, row];

        if (pageFits(candidatePage, { isFirstPage: pageIndex === 0 })) {
          currentPage.push(row);
          continue;
        }

        if (currentPage.length) {
          const { chunk, remaining } = splitRowForPage(row, pageIndex === 0, currentPage);

          if (remaining) {
            currentPage.push(chunk);
            startNextPage();
            pendingRows.unshift(remaining);
            continue;
          }

          startNextPage();
          pendingRows.unshift(row);
          continue;
        }

        const { chunk, remaining } = splitRowForPage(row, pageIndex === 0);
        currentPage.push(chunk);

        if (remaining) {
          startNextPage();
          pendingRows.unshift(remaining);
        }
      }

      while (pages.length > 1 && pages[pages.length - 1].length === 0) {
        pages.pop();
      }

      const pageLayouts: SterlingMechanicalPageLayout[] = pages.map((rows) => ({
        rows,
        tailBlocks: [],
      }));

      if (!pageLayouts.length) {
        pageLayouts.push({ rows: [], tailBlocks: [] });
      }

      let tailPageIndex = pageLayouts.length - 1;
      const summaryLayout = pageLayouts[tailPageIndex];

      if (
        pageFits(summaryLayout.rows, {
          isFirstPage: tailPageIndex === 0,
          tailBlocks: [summarySectionHtml],
        })
      ) {
        summaryLayout.tailBlocks = [summarySectionHtml];
      } else {
        pageLayouts.push({ rows: [], tailBlocks: [summarySectionHtml] });
        tailPageIndex = pageLayouts.length - 1;
      }

      const appendTailBlock = (tailBlock: string) => {
        const currentLayout = pageLayouts[tailPageIndex];
        const candidateTailBlocks = [...currentLayout.tailBlocks, tailBlock];

        if (
          pageFits(currentLayout.rows, {
            isFirstPage: tailPageIndex === 0,
            tailBlocks: candidateTailBlocks,
          })
        ) {
          currentLayout.tailBlocks.push(tailBlock);
          return;
        }

        pageLayouts.push({ rows: [], tailBlocks: [tailBlock] });
        tailPageIndex = pageLayouts.length - 1;
      };

      appendTailBlock(footerNoteHtml);

      if (attachmentTailBlocks.length) {
        pageLayouts.push({ rows: [], tailBlocks: [] });
        tailPageIndex = pageLayouts.length - 1;

        for (const tailBlock of attachmentTailBlocks) {
          appendTailBlock(tailBlock);
        }
      }

      return pageLayouts.filter((layout) => layout.rows.length || layout.tailBlocks.length);
    } catch {
      return fallbackLayouts;
    } finally {
      measurementHost.remove();
    }
  };

  const pages = paginateSterlingInvoiceRowsByLayout();
  const pagesHtml = pages
    .map((pageLayout, pageIndex) =>
      buildPageHtml(pageLayout.rows, {
        isFirstPage: pageIndex === 0,
        tailBlocks: pageLayout.tailBlocks,
      }),
    )
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
        <style>${sterlingMechanicalInvoiceStyles}</style>
      </head>
      <body>${pagesHtml}</body>
    </html>
  `;
};

const moralesContactIconSvg = (kind: 'location' | 'mail' | 'phone') => {
  if (kind === 'location') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <circle cx="12" cy="10" r="2.1" fill="none" stroke="currentColor" stroke-width="1.7"/>
      </svg>
    `;
  }

  if (kind === 'mail') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/>
        <path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 4.5 9.7 4l2 4.8-1.6 1.1c1 2 2.6 3.6 4.6 4.6l1.1-1.6 4.8 2-.5 2.3c-.2.9-1 1.5-1.9 1.5C10.6 18.7 4 12.1 4 4.5c0-.9.6-1.7 1.5-1.9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
    </svg>
  `;
};

const buildMoralesInvoiceRowsHtml = (rows: SterlingInvoiceRow[], includeBlankRows: boolean) => {
  const dataRowsHtml = buildSterlingInvoiceDisplayRows(rows)
    .map((row) => {
      const showDetails = row.showDetails !== false;
      const showMoney = row.showMoney !== false && !row.continuation;
      const rowClass = [
        'invoice-row',
        row.continuation ? 'invoice-row--continuation' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <tr class="${rowClass}">
          ${
            row.showUnitCell
              ? `<td class="unit-cell" rowspan="${row.unitRowSpan}">${buildInvoiceCellHtml(row.unit)}</td>`
              : ''
          }
          ${
            row.showAreaCell
              ? `<td class="area-cell" rowspan="${row.areaRowSpan}">${buildInvoiceCellHtml(row.area)}</td>`
              : ''
          }
          ${
            row.showServiceCell
              ? `<td class="service-cell${showDetails ? '' : ' continuation-cell'}" rowspan="${row.serviceRowSpan}">${
                  showDetails ? buildInvoiceCellHtml(row.service) : '&nbsp;'
                }</td>`
              : ''
          }
          <td class="description-cell">${buildSterlingDescriptionHtml(row.descriptionLines)}</td>
          <td class="money-cell${showMoney ? '' : ' continuation-cell'}">${showMoney ? formatPdfMoney(row.labor) : '&nbsp;'}</td>
          <td class="money-cell${showMoney ? '' : ' continuation-cell'}">${showMoney ? formatPdfMoney(row.unitPrice) : '&nbsp;'}</td>
        </tr>
      `;
    })
    .join('');

  const blankRowsHtml = includeBlankRows
    ? Array.from({ length: Math.max(4, 8 - rows.length) }, () => `
        <tr class="invoice-row invoice-row--blank">
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      `).join('')
    : '';

  return `${dataRowsHtml}${blankRowsHtml}`;
};

const paginateMoralesInvoiceRowsByEstimate = (rows: SterlingInvoiceRow[]) => {
  if (!rows.length) return [[]];

  const pages: SterlingInvoiceRow[][] = [[]];
  const pageCapacityFor = (pageIndex: number) => (pageIndex === 0 ? 11.8 : 20.6);
  let pageIndex = 0;
  let usedUnits = 0;

  const startNextPage = () => {
    pages.push([]);
    pageIndex += 1;
    usedUnits = 0;
  };

  rows.forEach((sourceRow) => {
    let remainingRow: SterlingInvoiceRow | null = sourceRow;

    while (remainingRow) {
      const currentPage = pages[pageIndex];
      const capacity = pageCapacityFor(pageIndex);
      const availableUnits = capacity - usedUnits;
      const rowUnits = estimateSterlingInvoiceRowUnits(remainingRow);

      if (rowUnits <= availableUnits) {
        currentPage.push(remainingRow);
        usedUnits += rowUnits;
        remainingRow = null;
        continue;
      }

      if (currentPage.length) {
        startNextPage();
        continue;
      }

      const { chunk, remaining } = splitSterlingRowForCapacity(remainingRow, capacity);
      currentPage.push(chunk);
      usedUnits += estimateSterlingInvoiceRowUnits(chunk);
      remainingRow = remaining;

      if (remainingRow) {
        startNextPage();
      }
    }
  });

  const summaryUnits = 7.4;
  const lastPageIndex = pages.length - 1;
  const lastPageUnits = estimateSterlingRowsUnits(pages[lastPageIndex] ?? []);

  if (lastPageUnits + summaryUnits > pageCapacityFor(lastPageIndex)) {
    pages.push([]);
  }

  return pages.length ? pages : [[]];
};

const moralesInvoiceStyles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html,
  body {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 0;
    background: rgb(255, 255, 255);
    color: rgb(17, 17, 17);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { overflow: auto; }
  .page {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 13mm 14mm 11mm;
    background: rgb(255, 255, 255);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page-continue { padding-top: 12mm; }
  .sheet-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .morales-header {
    display: grid;
    grid-template-columns: 58mm minmax(0, 1fr);
    gap: 16mm;
    align-items: start;
    margin-bottom: 8mm;
  }
  .logo-wrap {
    width: 53mm;
    height: 38mm;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    overflow: hidden;
  }
  .logo-wrap img {
    width: 53mm;
    height: 53mm;
    object-fit: contain;
    object-position: center top;
    display: block;
  }
  .contact-list {
    display: grid;
    gap: 3.2mm;
    padding-top: 3mm;
    justify-content: end;
    color: rgb(17, 17, 17);
  }
  .contact-row {
    display: grid;
    grid-template-columns: 6mm minmax(0, 78mm);
    gap: 3mm;
    align-items: center;
    font-size: 12px;
    line-height: 1.25;
  }
  .contact-row svg {
    width: 5.2mm;
    height: 5.2mm;
    display: block;
    color: rgb(17, 17, 17);
  }
  .contact-row span {
    display: block;
    overflow-wrap: anywhere;
  }
  .title-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10mm;
    align-items: end;
    margin-bottom: 5mm;
  }
  .title-row h1 {
    margin: 0;
    font-size: 38px;
    line-height: 0.95;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .date-line {
    display: flex;
    gap: 3mm;
    align-items: baseline;
    min-width: 54mm;
    padding-bottom: 2mm;
    font-size: 15px;
    line-height: 1;
    border-bottom: 1px solid rgb(17, 17, 17);
  }
  .date-line span {
    font-weight: 800;
  }
  .date-line strong {
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .customer-table,
  .invoice-table,
  .totals-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    color: rgb(17, 17, 17);
  }
  .customer-table {
    margin-bottom: 6mm;
  }
  .customer-table th,
  .customer-table td,
  .invoice-table th,
  .invoice-table td,
  .totals-table td {
    border: 1px solid rgb(17, 17, 17);
  }
  .customer-table th {
    height: 8.5mm;
    padding: 1.5mm 3mm;
    font-size: 13px;
    line-height: 1;
    text-align: left;
    font-weight: 800;
  }
  .customer-table td {
    min-height: 8.4mm;
    padding: 2mm 3mm;
    font-size: 12px;
    line-height: 1.25;
    vertical-align: middle;
  }
  .customer-table td:first-child {
    width: 36mm;
    font-weight: 800;
  }
  .invoice-table {
    margin-top: 0;
  }
  .invoice-table col:nth-child(1) { width: 13%; }
  .invoice-table col:nth-child(2) { width: 13%; }
  .invoice-table col:nth-child(3) { width: 14%; }
  .invoice-table col:nth-child(4) { width: 34%; }
  .invoice-table col:nth-child(5) { width: 12%; }
  .invoice-table col:nth-child(6) { width: 14%; }
  .invoice-table th {
    height: 9mm;
    padding: 1.5mm 2mm;
    font-size: 11.5px;
    line-height: 1.1;
    text-align: center;
    font-weight: 800;
    vertical-align: middle;
  }
  .invoice-table td {
    min-height: 11mm;
    height: 11mm;
    padding: 2mm;
    font-size: 10.5px;
    line-height: 1.3;
    vertical-align: top;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .invoice-table .description-cell {
    text-align: left;
  }
  .description-stack {
    display: grid;
    gap: 1.5mm;
  }
  .money-cell {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .continuation-cell {
    color: transparent;
  }
  .invoice-row--blank td {
    height: 11mm;
  }
  .last-section {
    margin-top: 8mm;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 67mm;
    gap: 12mm;
    align-items: start;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .observation-box {
    min-height: 38mm;
  }
  .observation-title {
    margin: 0 0 4mm;
    font-size: 14px;
    font-weight: 800;
  }
  .observation-lines {
    display: grid;
    gap: 5mm;
    font-size: 12px;
    line-height: 1.35;
    white-space: pre-line;
  }
  .observation-lines span {
    min-height: 8mm;
    border-bottom: 1px solid rgb(17, 17, 17);
  }
  .observation-lines i {
    display: block;
    min-height: 0;
    border-bottom: 1px solid rgb(17, 17, 17);
  }
  .totals-table td {
    height: 9.2mm;
    padding: 1.5mm 2.5mm;
    font-size: 12px;
    line-height: 1.1;
    vertical-align: middle;
  }
  .totals-table td:first-child {
    width: 41mm;
    font-weight: 800;
  }
  .totals-table td:last-child {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .totals-table .total-due td {
    height: 10.5mm;
    font-size: 14px;
    font-weight: 800;
  }
  .thank-you {
    margin-top: auto;
    padding-top: 8mm;
    text-align: center;
    font-family: "Brush Script MT", "Segoe Script", cursive;
    font-size: 24px;
    line-height: 1;
    font-weight: 400;
    break-inside: avoid;
    page-break-inside: avoid;
  }
`;

const buildMoralesInvoiceHtml = (data: MoralesInvoiceData) => {
  const tableRows = buildSterlingInvoiceTableRows(data.selectedItems);
  const observationText = data.observation.trim();
  const tableColumnsHtml = `
    <colgroup>
      <col />
      <col />
      <col />
      <col />
      <col />
      <col />
    </colgroup>
  `;
  const tableHeadHtml = `
    <thead>
      <tr>
        <th>Unit</th>
        <th>Area</th>
        <th>Service</th>
        <th>Description</th>
        <th>Labor</th>
        <th>Unit Price</th>
      </tr>
    </thead>
  `;
  const headerHtml = `
    <header class="morales-header">
      <div class="logo-wrap">
        <img src="${escapeHtml(moralesLogoUrl)}" alt="Morales Home Improvement logo">
      </div>
      <div class="contact-list">
        <div class="contact-row">
          ${moralesContactIconSvg('location')}
          <span>3820 Superior Ave, Cleveland, OH 44114</span>
        </div>
        <div class="contact-row">
          ${moralesContactIconSvg('mail')}
          <span>Moralesroofing520@gmail.com</span>
        </div>
        <div class="contact-row">
          ${moralesContactIconSvg('phone')}
          <span>(216) 926-1765</span>
        </div>
      </div>
    </header>
  `;
  const titleHtml = `
    <section class="title-row">
      <h1>INVOICE</h1>
      <div class="date-line">
        <span>Date:</span>
        <strong>${escapeHtml(formatPdfDate(data.docDate))}</strong>
      </div>
    </section>
  `;
  const customerDetailsHtml = `
    <table class="customer-table">
      <thead>
        <tr><th colspan="2">Customer Details</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Name:</td>
          <td>${escapeHtml(data.customerName || '-')}</td>
        </tr>
        <tr>
          <td>Address:</td>
          <td>${escapeHtml(data.customerAddress || '-')}</td>
        </tr>
        <tr>
          <td>Email / Phone:</td>
          <td>${escapeHtml(data.customerContact || '')}</td>
        </tr>
      </tbody>
    </table>
  `;
  const summaryHtml = `
    <section class="last-section">
      <div class="observation-box">
        <p class="observation-title">Observation:</p>
        <div class="observation-lines">
          <span>${observationText ? escapeHtml(observationText).replace(/\r?\n/g, '<br>') : '&nbsp;'}</span>
          <i></i>
          <i></i>
          <i></i>
        </div>
      </div>
      <table class="totals-table">
        <tbody>
          <tr>
            <td>Labor Total</td>
            <td>${formatPdfMoney(data.laborTotal)}</td>
          </tr>
          <tr>
            <td>Job Total</td>
            <td>${formatPdfMoney(data.jobTotal)}</td>
          </tr>
          <tr>
            <td>Expenses</td>
            <td>${formatPdfMoney(data.expenses)}</td>
          </tr>
          <tr>
            <td>Invoicing Services</td>
            <td>${formatPdfMoney(data.invoicingServices)}</td>
          </tr>
          <tr class="total-due">
            <td>Total Due</td>
            <td>${formatPdfMoney(data.totalDue)}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <div class="thank-you">Thank You for Your Business!</div>
  `;

  const pages = paginateMoralesInvoiceRowsByEstimate(tableRows);
  const pagesHtml = pages
    .map((pageRows, pageIndex) => {
      const isFirstPage = pageIndex === 0;
      const isLastPage = pageIndex === pages.length - 1;
      const rowsHtml = buildMoralesInvoiceRowsHtml(pageRows, isLastPage);
      const tableHtml = rowsHtml
        ? `
          <table class="invoice-table">
            ${tableColumnsHtml}
            ${isFirstPage ? tableHeadHtml : ''}
            <tbody>${rowsHtml}</tbody>
          </table>
        `
        : '';

      return `
        <div class="page ${isFirstPage ? 'page-first' : 'page-continue'}">
          <main class="sheet-body">
            ${isFirstPage ? `${headerHtml}${titleHtml}${customerDetailsHtml}` : ''}
            ${tableHtml}
            ${isLastPage ? summaryHtml : ''}
          </main>
        </div>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Morales Invoice</title>
        <style>${moralesInvoiceStyles}</style>
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
          '<strong>ryangoertler1313@gmail.com</strong>',
        ].join('<br>')
      : data.ownerKey === 'todd'
        ? [
            'Concord Twp, Ohio 44077',
            '<strong>Main (440)666-5608</strong>',
            '<strong>@todd.go</strong>',
          ].join('<br>')
      : [
          '15222 Saranac Rd,',
          'Lindmar Dr. Concord Twp. OH',
          '<strong>775 297-6035</strong>',
          '<strong>azabache643@gmail.com</strong>',
          'IG: azedj.pe',
        ].join('<br>');

  const isRyanInvoice = data.ownerKey === 'ryan' && data.documentType === 'Invoice';
  const ryanGroups = isRyanInvoice ? buildRyanInvoiceGroups(data.selectedItems) : [];
  const ryanColumnLayout = buildRyanInvoiceColumnLayout(ryanGroups);
  const billToHtml = escapeHtml(data.billTo).replace(/\r?\n/g, '<br>');
  const docDateHtml = escapeHtml(data.docDate);
  const companyNameHtml = data.ownerKey === 'todd' ? 'Todd<br>Goertler' : 'Ryan<br>Goertler';
  const headerClass =
    data.ownerKey === 'ryan'
      ? 'invoice-header ryan'
      : data.ownerKey === 'todd'
        ? 'invoice-header todd'
        : 'invoice-header aze';
  const materialLabel = data.documentType === 'Quote' ? 'Material Expense Estimate' : 'Material Expense';
  const primaryLaborLabel =
    data.ownerKey === 'todd' ? 'Todd Labor' : data.ownerKey === 'ryan' ? 'Labor' : 'Primary Labor';
  const summaryLabelColspan = isRyanInvoice ? 4 : 2;
  const tableHeadHtml = isRyanInvoice ? ryanInvoiceTableHeadHtml : legacyTableHeadHtml;
  const tableClassName = isRyanInvoice ? 'ryan-invoice-table' : '';

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

  const headerHtml = `
    <div class="${headerClass}">
      <div class="header-inner">
        <div class="header-left">
          <span class="invoice-title">${escapeHtml(data.documentType)}</span>
          <span class="invoice-number">No. ${escapeHtml(data.invoiceNumber)}</span>
        </div>
        <div class="header-right">
          <span class="company-name">${companyNameHtml}</span>
          <div class="company-info">${companyInfoHtml}</div>
        </div>
      </div>
    </div>
  `;

  const ryanOpeningBlockHtml = `
    <section class="ryan-title-band">
      <div class="ryan-title-band-inner">
        <div class="ryan-title-left">
          <span class="invoice-title">${escapeHtml(data.documentType)}</span>
          <span class="invoice-number">No. ${escapeHtml(data.invoiceNumber)}</span>
        </div>
        <div class="ryan-title-right">
          <span class="company-name">${companyNameHtml}</span>
          <div class="company-info">${companyInfoHtml}</div>
        </div>
      </div>
    </section>
  `;

  const paymentDetailsHtml = `
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
  `;

  const summaryRowsHtml = `
    <tr>
      <td colspan="${summaryLabelColspan + 1}" class="terms-cell">
        Payment due upon receipt unless otherwise agreed. Please include the ${escapeHtml(data.documentType.toLowerCase())} number with payment. Thank you for your business.
      </td>
    </tr>
    <tr>
      <td colspan="${summaryLabelColspan}" class="summary-label-blue">${escapeHtml(primaryLaborLabel)}</td>
      <td class="amount-blue">${formatPdfMoney(data.ryanLabor)}</td>
    </tr>
    <tr>
      <td colspan="${summaryLabelColspan}" class="summary-label-blue">Juan Labor</td>
      <td class="amount-blue">${formatPdfMoney(data.juanLabor)}</td>
    </tr>
    <tr>
      <td colspan="${summaryLabelColspan}" class="summary-label-blue">Job Total</td>
      <td class="amount-blue">${formatPdfMoney(data.jobTotal)}</td>
    </tr>
    <tr>
      <td colspan="${summaryLabelColspan}" class="summary-label-blue" style="color:red;">${escapeHtml(materialLabel)}</td>
      <td class="amount-blue" style="color:red;">${formatPdfMoney(data.materialExpense)}</td>
    </tr>
    <tr>
      <td colspan="${summaryLabelColspan}" class="summary-label-blue" style="font-size:16px;">Total Due</td>
      <td class="amount-blue" style="font-size:16px;">${formatPdfMoney(data.totalDue)}</td>
    </tr>
  `;

  const legacySterlingPdfStyles = `
    @page { size: A4; margin: 0; }
    html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; background: #ffffff; font-family: ${pdfTypewriterFontFamily}; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { overflow: auto; }
    .page { width: 210mm; height: 297mm; margin: 0; padding: 14mm 12mm 10mm 12mm; background: #ffffff; overflow: hidden; box-sizing: border-box; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .legacy-page { display: flex; flex-direction: column; }
    .legacy-page--continue { padding: 12mm 12mm 10mm 12mm; }
    .legacy-page--last { padding-bottom: 10mm; }
    .ryan-body-page { padding: 14mm 12mm 10mm 12mm; }
    .ryan-body-page.legacy-page--continue { padding: 12mm 12mm 10mm 12mm; }
    .ryan-body { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .ryan-title-band { width: 100%; padding: 18px 0; margin: 0 0 8px 0; color: #ffffff; background-color: #24c6dc; background-image: linear-gradient(to bottom, #24c6dc, #c471ed); }
    .ryan-title-band-inner { width: 100%; margin: 0 auto; padding: 0 24px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; }
    .ryan-title-left { line-height: 0.9; }
    .ryan-title-right { text-align: right; font-size: 12px; line-height: 1.5; }
    .invoice-header { width: 100%; padding: 18px 0; margin: 0; color: #ffffff; }
    .invoice-header.aze { background-color: #b40000; background-image: linear-gradient(to bottom, #b40000, #ff7c7c); }
    .invoice-header.ryan { background-color: #24c6dc; background-image: linear-gradient(to bottom, #24c6dc, #c471ed); }
    .invoice-header.todd { background-color: #1f2328; background-image: linear-gradient(to bottom, #1f2328, #58636f); }
    .header-inner { width: 100%; margin: 0 auto; padding: 0 24px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; }
    .header-left { line-height: 0.9; }
    .invoice-title { display: block; font-size: 58px; font-weight: 800; letter-spacing: 1px; color: #ffffff; }
    .invoice-number { display: block; font-size: 58px; font-weight: 800; color: #ffffff; }
    .header-right { text-align: right; font-size: 12px; line-height: 1.5; }
    .company-name { display: block; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
    .company-info { font-size: 13px; }
    .company-info strong { font-weight: 800; }
    .invoice-body { padding: 8px 16px 0 16px; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
    .invoice-body--continue { padding-top: 0; }
    .legacy-table-shell { flex: 1 1 auto; min-height: 0; padding-bottom: 12mm; box-sizing: border-box; }
    .legacy-table-shell--last { padding-bottom: 16mm; }
    .ryan-table-shell { flex: 0 0 auto; padding-bottom: 0; overflow: visible; }
    .ryan-table-shell--last { padding-bottom: 0; }
    table { border-collapse: collapse; width: 100%; background-color: #ffffff; }
    th, td { border: 1px solid #1f4dbb; padding: 5px; word-wrap: break-word; color: #1f4dbb; }
    th { background-color: #f2f2f2; color: #1f4dbb; text-align: center; }
    td.desc-cell { text-align: left; }
    table.ryan-invoice-table {
      table-layout: fixed;
      --ryan-unit-col: ${ryanColumnLayout.unit}%;
      --ryan-area-col: ${ryanColumnLayout.area}%;
      --ryan-service-col: ${ryanColumnLayout.service}%;
      --ryan-desc-col: ${ryanColumnLayout.description}%;
      --ryan-price-col: ${ryanColumnLayout.price}%;
    }
    table.ryan-invoice-table th { font-size: 10px; padding: 8px 6px; }
    th.ryan-unit-head, td.ryan-unit-cell { width: var(--ryan-unit-col); }
    th.ryan-area-head, td.ryan-area-cell { width: var(--ryan-area-col); }
    th.ryan-service-head, td.ryan-service-cell { width: var(--ryan-service-col); }
    th.ryan-desc-head, td.ryan-desc-cell { width: var(--ryan-desc-col); }
    th.ryan-price-head, td.ryan-price-cell { width: var(--ryan-price-col); }
    th.ryan-desc-head { text-align: center; vertical-align: middle; }
    .legacy-group-row td { break-inside: avoid; page-break-inside: avoid; }
    td.service-cell { text-align: center; vertical-align: middle; font-weight: 800; width: 22%; }
    td.service-cell--continuation { font-size: 11px; }
    td.price-cell { text-align: center; vertical-align: middle; font-weight: 800; width: 18%; }
    td.ryan-unit-cell,
    td.ryan-area-cell,
    td.ryan-service-cell,
    td.ryan-price-cell { text-align: center; vertical-align: middle; font-weight: 800; font-size: 10px; line-height: 1.3; }
    td.ryan-desc-cell { text-align: left !important; font-size: 10px; line-height: 1.35; }
    .ryan-area-address { display: grid; gap: 1px; }
    .ryan-area-line { display: block; line-height: 1.12; }
    .ryan-area-line--city { font-size: 9px; }
    .ryan-desc-stack { display: block; width: 100%; margin: 0; text-align: left !important; }
    .ryan-desc-line { display: block; width: 100%; margin: 0 0 3px 0; text-align: left !important; }
    .ryan-desc-line:last-child { margin-bottom: 0; }
    td.ryan-service-cell { word-break: break-word; }
    td.ryan-meta-cell--continuation { font-size: 9px; }
    .summary-label-blue { text-align: right; vertical-align: middle; color: #1f4dbb; font-weight: 800; }
    .amount-blue { text-align: center; color: #1f4dbb; font-weight: 800; font-size: 11px; vertical-align: middle; }
    .terms-cell { color: #000000; font-size: 10px; line-height: 1.45; background: #f7fbff; text-align: left; }
    td.is-empty { color: transparent; }
    .top-details-wrap { border-top: 3px solid #1f4dbb; margin-top: 4px; padding-top: 6px; margin-bottom: 8px; }
    .payment-title { color: #1f4dbb; font-weight: 800; font-size: 14px; display: block; margin-bottom: 6px; }
    .payment-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
    .payment-title-row { grid-column: 1 / -1; }
    .p-left, .p-right { font-size: 12px; line-height: 1.6; color: #000000; }
    .label-blue { color: #1f4dbb; font-weight: 800; }
    .value-black { color: #000000; font-weight: 400; }
  `;

  const buildRyanPageHtml = (
    chunks: RyanInvoiceChunk[],
    options: { isFirstPage: boolean; includeSummary: boolean },
  ) => `
    <div class="page legacy-page ryan-body-page ${options.isFirstPage ? '' : 'legacy-page--continue'} ${options.includeSummary ? 'legacy-page--last' : ''}">
      <main class="ryan-body">
        ${options.isFirstPage ? ryanOpeningBlockHtml : ''}
        ${options.isFirstPage ? paymentDetailsHtml : ''}
        <div class="legacy-table-shell ryan-table-shell ${options.includeSummary ? 'legacy-table-shell--last ryan-table-shell--last' : ''}">
          <table class="ryan-invoice-table">
            ${options.isFirstPage ? ryanInvoiceTableHeadHtml : ''}
            ${buildRyanInvoiceRowsHtml(chunks)}
            ${options.includeSummary ? summaryRowsHtml : ''}
          </table>
        </div>
      </main>
    </div>
  `;

  const renderRyanPagesHtml = () => {
    const groups = ryanGroups;
    const fallbackPage: RyanInvoiceChunk[] = groups.map((group) => ({
      ...group,
      continuation: false,
      showPrice: true,
    }));

    if (typeof document === 'undefined') {
      return buildRyanPageHtml(fallbackPage, {
        isFirstPage: true,
        includeSummary: true,
      });
    }

    const measurementHost = document.createElement('div');
    Object.assign(measurementHost.style, {
      position: 'fixed',
      left: '-250vw',
      top: '0',
      width: '210mm',
      minHeight: '297mm',
      visibility: 'hidden',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.body.appendChild(measurementHost);

    const pageFits = (chunks: RyanInvoiceChunk[], options: { isFirstPage: boolean; includeSummary: boolean }) => {
      measurementHost.innerHTML = `<style>${legacySterlingPdfStyles}</style>${buildRyanPageHtml(chunks, options)}`;
      const body = measurementHost.querySelector<HTMLElement>('.ryan-body');
      const table = measurementHost.querySelector<HTMLElement>('.ryan-invoice-table');

      if (!body || !table) {
        return true;
      }

      const bodyRect = body.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      return tableRect.bottom <= bodyRect.bottom + 0.5;
    };

    const pages: RyanInvoiceChunk[][] = [[]];

    try {
      let pageIndex = 0;

      for (const group of groups) {
        let sentenceIndex = 0;

        while (sentenceIndex < group.sentences.length) {
          const currentPage = pages[pageIndex];
          const isFirstPage = pageIndex === 0;
          let bestSentenceCount = 0;
          let low = 1;
          let high = group.sentences.length - sentenceIndex;

          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candidateChunk: RyanInvoiceChunk = {
              ...group,
              sentences: group.sentences.slice(sentenceIndex, sentenceIndex + mid),
              continuation: sentenceIndex > 0,
              showPrice: sentenceIndex === 0,
            };

            if (pageFits([...currentPage, candidateChunk], { isFirstPage, includeSummary: false })) {
              bestSentenceCount = mid;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }

          if (bestSentenceCount === 0) {
            if (currentPage.length === 0) {
              currentPage.push({
                ...group,
                sentences: [group.sentences[sentenceIndex]],
                continuation: sentenceIndex > 0,
                showPrice: sentenceIndex === 0,
              });
              sentenceIndex += 1;
            }

            pages.push([]);
            pageIndex += 1;
            continue;
          }

          currentPage.push({
            ...group,
            sentences: group.sentences.slice(sentenceIndex, sentenceIndex + bestSentenceCount),
            continuation: sentenceIndex > 0,
            showPrice: sentenceIndex === 0,
          });
          sentenceIndex += bestSentenceCount;

          if (sentenceIndex < group.sentences.length) {
            pages.push([]);
            pageIndex += 1;
          }
        }
      }

      while (pages.length > 1 && pages[pages.length - 1].length === 0) {
        pages.pop();
      }

      const lastContentPageIndex = pages.length - 1;

      if (!pageFits(pages[lastContentPageIndex], { isFirstPage: lastContentPageIndex === 0, includeSummary: true })) {
        const summaryPageChunks: RyanInvoiceChunk[] = [];

        for (let sourcePageIndex = pages.length - 1; sourcePageIndex >= 0; sourcePageIndex -= 1) {
          const sourcePage = pages[sourcePageIndex];

          while (sourcePage.length > 0) {
            const candidateChunk = sourcePage[sourcePage.length - 1];
            const candidateSummaryPage = [candidateChunk, ...summaryPageChunks];

            if (!pageFits(candidateSummaryPage, { isFirstPage: false, includeSummary: true })) {
              break;
            }

            summaryPageChunks.unshift(sourcePage.pop() as RyanInvoiceChunk);
          }

          if (sourcePage.length > 0) {
            break;
          }
        }

        while (pages.length > 1 && pages[pages.length - 1].length === 0) {
          pages.pop();
        }

        pages.push(summaryPageChunks);
      }

      while (pages.length > 1 && pages[0].length === 0) {
        pages.shift();
      }

      return pages
        .map((pageChunks, pageIndex) =>
          buildRyanPageHtml(pageChunks, {
            isFirstPage: pageIndex === 0,
            includeSummary: pageIndex === pages.length - 1,
          }),
        )
        .join('');
    } finally {
      measurementHost.remove();
    }
  };

  const renderedPageRows = isRyanInvoice
    ? []
    : paginateLegacyServiceGroups(buildLegacyServiceGroups(data.selectedItems)).map((pageChunks) =>
        buildLegacyRowsHtml(pageChunks),
      );

  const pagesHtml = isRyanInvoice
    ? renderRyanPagesHtml()
    : renderedPageRows
        .map((rowsHtml, pageIndex) => {
          const isFirstPage = pageIndex === 0;
          const isLastPage = pageIndex === renderedPageRows.length - 1;

          if (isFirstPage) {
            return `
              <div class="page legacy-page ${isLastPage ? 'legacy-page--last' : ''}">
                ${headerHtml}
                <div class="invoice-body">
                  ${paymentDetailsHtml}
                  <div class="legacy-table-shell ${isLastPage ? 'legacy-table-shell--last' : ''}">
                    <table class="${tableClassName}">
                      ${tableHeadHtml}
                      ${rowsHtml}
                      ${isLastPage ? summaryRowsHtml : ''}
                    </table>
                  </div>
                </div>
              </div>
            `;
          }

          return `
            <div class="page legacy-page legacy-page--continue ${isLastPage ? 'legacy-page--last' : ''}">
              <div class="invoice-body invoice-body--continue">
                <div class="legacy-table-shell ${isLastPage ? 'legacy-table-shell--last' : ''}">
                  <table class="${tableClassName}">
                    ${tableHeadHtml}
                    ${rowsHtml}
                    ${isLastPage ? summaryRowsHtml : ''}
                  </table>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(data.documentType)} ${escapeHtml(data.invoiceNumber)}</title>
        <style>${legacySterlingPdfStyles}</style>
      </head>
      <body>${pagesHtml}</body>
    </html>
  `;
};

export function InvoiceQuoteView({
  properties,
  jobs,
  documents,
  canDelete,
  onDeleteDocument,
  onDocumentSaved,
  onDocumentError,
}: {
  properties: PropertySummary[];
  jobs: JobRow[];
  documents: GeneratedDocumentHistoryItem[];
  canDelete: boolean;
  onDeleteDocument: (
    documentId: string,
    options: { kind: 'Invoice' | 'Quote'; documentNumber: string; fileName: string },
  ) => void;
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
  const [expensesInput, setExpensesInput] = useState('0');
  const [invoicingServicesInput, setInvoicingServicesInput] = useState('0');
  const [observation, setObservation] = useState('');
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [expandedAttachmentKinds, setExpandedAttachmentKinds] = useState<
    Record<PdfAttachmentFile['kind'], boolean>
  >({
    before: false,
    after: false,
    receipt: false,
  });
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [selectedRyanReceiptIds, setSelectedRyanReceiptIds] = useState<string[]>([]);
  const [descriptionEdits, setDescriptionEdits] = useState<Record<string, string>>({});
  const [itemLaborEdits, setItemLaborEdits] = useState<Record<string, string>>({});
  const [itemUnitPriceEdits, setItemUnitPriceEdits] = useState<Record<string, string>>({});
  const [jobSelection, setJobSelection] = useState<JobSelectionState>({
    propertyId: '',
    ids: [],
    mode: 'auto',
  });
  const [isServicesOpen, setIsServicesOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<GeneratedDocumentContent | null>(null);
  const [generatePdfConfirmOpen, setGeneratePdfConfirmOpen] = useState(false);
  const [generatePdfBusy, setGeneratePdfBusy] = useState(false);
  const [documentPreviewNotice, setDocumentPreviewNotice] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPropertyId, setHistoryPropertyId] = useState('');
  const [historyOwner, setHistoryOwner] = useState<DocumentOwnerFilter>('ALL');
  const [historyType, setHistoryType] = useState<'ALL' | 'INVOICE' | 'QUOTE'>('ALL');
  const [historyDateRange, setHistoryDateRange] = useState<'ALL' | 'TODAY' | '7' | '30'>('ALL');
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const normalizedPropertyId =
    propertyId && properties.some((property) => property.id === propertyId) ? propertyId : '';
  const propertyJobs = useMemo(
    () => (normalizedPropertyId ? jobs.filter((job) => job.propertyId === normalizedPropertyId) : []),
    [jobs, normalizedPropertyId],
  );
  const invoiceJobGroups = useMemo(() => buildInvoiceJobGroups(propertyJobs), [propertyJobs]);
  const selectedJobIds = useMemo(
    () =>
      jobSelection.mode === 'manual' && jobSelection.propertyId === normalizedPropertyId
        ? propertyJobs.filter((job) => jobSelection.ids.includes(job.id)).map((job) => job.id)
        : propertyJobs.map((job) => job.id),
    [jobSelection.ids, jobSelection.mode, jobSelection.propertyId, normalizedPropertyId, propertyJobs],
  );
  const selectedJobs = useMemo(
    () => propertyJobs.filter((job) => selectedJobIds.includes(job.id)),
    [propertyJobs, selectedJobIds],
  );
  const allSelected = propertyJobs.length > 0 && selectedJobIds.length === propertyJobs.length;
  const activeProperty = properties.find((property) => property.id === normalizedPropertyId) ?? null;
  const ownerKey = ownerKeyFor(headerOwner);
  const ownerLabel = ownerLabelFor(ownerKey);
  const usesSterlingInvoice = ownerKey === 'ryan' && documentType === 'Invoice';
  const usesMoralesInvoice = ownerKey === 'morales' && documentType === 'Invoice';
  const usesLineItemInvoice = usesSterlingInvoice || usesMoralesInvoice;
  const effectiveDocumentNumber = documentNumber.trim();
  const documentNumberExists = documents.some((document) => {
    const targetType = documentType === 'Invoice' ? 'INVOICE' : 'QUOTE';
    return (
      document.documentType === targetType &&
      document.documentNumber.trim().toLowerCase() === effectiveDocumentNumber.toLowerCase()
    );
  });
  const descriptionValueFor = (job: JobRow) => descriptionEdits[job.id] ?? normalizeInvoiceDescription(job.description);
  const displayedSelectedCount = selectedJobIds.length;

  useEffect(() => {
    if (!documentPreviewOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDocumentPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [documentPreviewOpen]);

  const selectedItems: PdfServiceItem[] = useMemo(
    () => {
      const items = selectedJobs.map((job) => {
        const labor = usesLineItemInvoice
          ? toAmount(itemLaborEdits[job.id] ?? String(job.laborCost))
          : 0;
        const unitPrice = usesLineItemInvoice
          ? toAmount(itemUnitPriceEdits[job.id] ?? String(getSterlingUnitPriceFromLabor(job, labor)))
          : job.totalCost;

        return {
          story: job.story,
          unit: job.unit,
          area: job.area,
          service: job.service,
          description: normalizeInvoiceDescription(descriptionEdits[job.id] ?? normalizeInvoiceDescription(job.description)),
          labor,
          unitPrice,
        };
      });

      return mergePdfServiceItems(items);
    },
    [descriptionEdits, itemLaborEdits, itemUnitPriceEdits, selectedJobs, usesLineItemInvoice],
  );
  const selectedPhotoAttachments = useMemo(
    () => buildPdfAttachmentsForJobs(selectedJobs, invoicePhotoAttachmentKinds),
    [selectedJobs],
  );
  const propertyReceiptAttachments = useMemo(
    () => buildPdfAttachmentsForJobs(propertyJobs, receiptAttachmentKinds),
    [propertyJobs],
  );
  useEffect(() => {
    setSelectedRyanReceiptIds((current) => {
      const availableIds = new Set(propertyReceiptAttachments.map((attachment) => attachment.id));
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [propertyReceiptAttachments]);
  const selectedJobAttachments: PdfAttachmentFile[] = useMemo(
    () => [...selectedPhotoAttachments, ...propertyReceiptAttachments],
    [propertyReceiptAttachments, selectedPhotoAttachments],
  );
  useEffect(() => {
    setSelectedAttachmentIds((current) => {
      const availableIds = new Set(selectedJobAttachments.map((attachment) => attachment.id));
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [selectedJobAttachments]);
  const attachmentCounts = useMemo(
    () =>
      selectableAttachmentKinds.reduce((counts, kind) => ({
        ...counts,
        [kind]: selectedJobAttachments.filter((attachment) => attachment.kind === kind).length,
      }), {} as Record<PdfAttachmentFile['kind'], number>),
    [selectedJobAttachments],
  );
  const selectedAttachmentIdSet = useMemo(
    () => new Set(selectedAttachmentIds),
    [selectedAttachmentIds],
  );
  const selectedAttachments = useMemo(
    () => selectedJobAttachments.filter((attachment) => selectedAttachmentIdSet.has(attachment.id)),
    [selectedAttachmentIdSet, selectedJobAttachments],
  );
  const selectedInvoicePhotoAttachments = useMemo(
    () => selectedAttachments.filter((attachment) => attachment.kind !== 'receipt'),
    [selectedAttachments],
  );
  const selectedRyanReceiptAttachments = useMemo(() => {
    if (ownerKey !== 'ryan') {
      return [];
    }

    const selectedReceiptIds = new Set(selectedRyanReceiptIds);
    return propertyReceiptAttachments.filter((attachment) => selectedReceiptIds.has(attachment.id));
  }, [ownerKey, propertyReceiptAttachments, selectedRyanReceiptIds]);
  const selectedReceiptAttachments = useMemo(
    () =>
      ownerKey === 'ryan'
        ? selectedRyanReceiptAttachments
        : selectedAttachments.filter((attachment) => attachment.kind === 'receipt'),
    [ownerKey, selectedAttachments, selectedRyanReceiptAttachments],
  );
  const availableAttachmentKinds = selectableAttachmentKinds;
  const hasSelectablePdfAttachments = availableAttachmentKinds.some((kind) => attachmentCounts[kind] > 0);
  const allowsPdfAttachments = documentType === 'Invoice' && !usesMoralesInvoice;
  const allRyanReceiptsSelected =
    ownerKey === 'ryan' &&
    propertyReceiptAttachments.length > 0 &&
    selectedRyanReceiptAttachments.length === propertyReceiptAttachments.length;
  const includeInlineInvoicePhotosInPdf =
    documentType === 'Invoice' &&
    (ownerKey === 'aze' || ownerKey === 'ryan' || ownerKey === 'todd') &&
    selectedInvoicePhotoAttachments.length > 0;
  const includeReceiptAppendicesInPdf =
    documentType === 'Invoice' &&
    (ownerKey === 'aze' || ownerKey === 'ryan' || ownerKey === 'todd') &&
    selectedReceiptAttachments.length > 0;
  const selectedAttachmentSummary = availableAttachmentKinds
    .map((kind) => {
      const usesRyanReceiptSelection = ownerKey === 'ryan' && kind === 'receipt';
      const selectedCount = usesRyanReceiptSelection
        ? selectedRyanReceiptAttachments.length
        : selectedAttachments.filter((attachment) => attachment.kind === kind).length;
      const totalCount = usesRyanReceiptSelection ? propertyReceiptAttachments.length : attachmentCounts[kind];

      return selectedCount > 0 ? `${attachmentKindLabels[kind]} (${selectedCount} of ${totalCount})` : '';
    })
    .filter(Boolean)
    .join(', ');

  const usesManualAmounts = ownerKey !== 'todd' && !usesLineItemInvoice;
  const servicesTotal = selectedItems.reduce((sum, item) => sum + item.unitPrice, 0);
  const sterlingLaborTotal = selectedItems.reduce((sum, item) => sum + Number(item.labor || 0), 0);
  const sterlingJobTotal = selectedItems.reduce((sum, item) => {
    const labor = Number(item.labor || 0);
    const unitPrice = Number(item.unitPrice || 0);
    return sum + labor + unitPrice;
  }, 0);
  const sterlingExpensesValue = usesLineItemInvoice ? toAmount(expensesInput) : 0;
  const sterlingInvoicingServicesValue = usesLineItemInvoice ? toAmount(invoicingServicesInput) : 0;
  const ryanLaborValue = usesManualAmounts ? toAmount(ryanLabor) : 0;
  const juanLaborValue = usesManualAmounts ? toAmount(juanLabor) : 0;
  const advancePaymentValue = usesManualAmounts ? toAmount(advancePayment) : 0;
  const materialExpenseValue = usesManualAmounts ? toAmount(materialExpense) : 0;
  const jobTotal = usesLineItemInvoice ? sterlingJobTotal : servicesTotal + ryanLaborValue + juanLaborValue;
  const expenses = usesLineItemInvoice ? sterlingExpensesValue : materialExpenseValue + advancePaymentValue;
  const invoicingServices = usesLineItemInvoice ? sterlingInvoicingServicesValue : 0;
  const totalDue = usesLineItemInvoice
    ? jobTotal - expenses - invoicingServices
    : Math.max(jobTotal - expenses, 0);

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
  const customerName = billToLines[0] || clientName;
  const customerAddress = billToLines[1] || [propertyAddress, propertyCityLine].filter(Boolean).join(', ');
  const customerContact = billToLines.slice(2).join(' / ');
  const timeFrame = `${formatPdfDate(firstJobDate)} - ${formatPdfDate(lastJobDate)}`;

  const previewRows = usesLineItemInvoice
    ? [
        { label: 'Labor Total', value: sterlingLaborTotal },
        { label: 'Job Total', value: jobTotal },
        { label: 'Expenses', value: expenses },
        { label: 'Invoicing Services', value: invoicingServices },
        { label: 'Total Due', value: totalDue, strong: true },
      ]
    : usesManualAmounts
    ? [
        { label: 'Services Total', value: servicesTotal },
        { label: 'Primary Labor', value: ryanLaborValue },
        { label: 'Juan Labor', value: juanLaborValue },
        { label: 'Job Total', value: jobTotal },
        { label: 'Material Expense', value: materialExpenseValue },
        { label: 'Advance Payment', value: advancePaymentValue },
        { label: 'Expenses', value: expenses },
        { label: 'Total Due', value: totalDue, strong: true },
      ]
    : [
        { label: 'Services Total', value: servicesTotal },
        { label: 'Job Total', value: jobTotal },
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

  const toggleJobGroupSelection = (jobIds: string[]) => {
    if (jobIds.length === 1) {
      toggleJobSelection(jobIds[0] as string);
      return;
    }

    const selectedIds = new Set(selectedJobIds);
    const allGroupSelected = jobIds.every((id) => selectedIds.has(id));
    const groupIds = new Set(jobIds);
    const nextIds = allGroupSelected
      ? selectedJobIds.filter((id) => !groupIds.has(id))
      : [
          ...selectedJobIds,
          ...jobIds.filter((id) => !selectedIds.has(id)),
        ];

    setJobSelection({
      propertyId: normalizedPropertyId,
      ids: nextIds,
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

  const toggleAttachmentKindOpen = (kind: PdfAttachmentFile['kind']) => {
    setExpandedAttachmentKinds((current) => ({
      ...current,
      [kind]: !current[kind],
    }));
  };

  const setAttachmentKindSelected = (kind: PdfAttachmentFile['kind'], checked: boolean) => {
    const kindIds = selectedJobAttachments
      .filter((attachment) => attachment.kind === kind)
      .map((attachment) => attachment.id);

    setSelectedAttachmentIds((current) => {
      const nextIds = new Set(current);
      kindIds.forEach((id) => {
        if (checked) {
          nextIds.add(id);
        } else {
          nextIds.delete(id);
        }
      });
      return [...nextIds];
    });
  };

  const setAttachmentSelected = (attachmentId: string, checked: boolean) => {
    setSelectedAttachmentIds((current) => {
      if (checked) {
        return current.includes(attachmentId) ? current : [...current, attachmentId];
      }

      return current.filter((id) => id !== attachmentId);
    });
  };

  const updateDescriptionEdit = (jobId: string, value: string) => {
    setDescriptionEdits((current) => ({
      ...current,
      [jobId]: value,
    }));
  };

  const commitDescriptionEdit = (job: JobRow) => {
    const nextValue = normalizeInvoiceDescription(descriptionValueFor(job));

    setDescriptionEdits((current) => {
      if (current[job.id] === nextValue) {
        return current;
      }

      return {
        ...current,
        [job.id]: nextValue,
      };
    });
  };

  const resetPreview = () => {
    setRyanLabor('0');
    setJuanLabor('0');
    setAdvancePayment('0');
    setMaterialExpense('0');
    setExpensesInput('0');
    setInvoicingServicesInput('0');
    setObservation('');
    setJobSelection({
      propertyId: normalizedPropertyId,
      ids: propertyJobs.map((job) => job.id),
      mode: 'auto',
    });
    setDescriptionEdits((current) => {
      const next = { ...current };
      propertyJobs.forEach((job) => {
        delete next[job.id];
      });
      return next;
    });
    setItemLaborEdits((current) => {
      const next = { ...current };
      propertyJobs.forEach((job) => {
        delete next[job.id];
      });
      return next;
    });
    setItemUnitPriceEdits((current) => {
      const next = { ...current };
      propertyJobs.forEach((job) => {
        delete next[job.id];
      });
      return next;
    });
  };

  const openDocument = (path: string) => {
    window.open(buildAssetUrl(path), '_blank', 'noopener,noreferrer,width=1060,height=900');
  };

  const buildGeneratedDocumentContent = useCallback((
    documentNumberOverride?: string,
    attachmentsOverride?: PdfAttachmentFile[],
  ): GeneratedDocumentContent | null => {
    if (!selectedItems.length) {
      return null;
    }

    const useSterlingMechanicalInvoice = ownerKey === 'ryan' && documentType === 'Invoice';
    const useAzeModernInvoice = ownerKey === 'aze' && documentType === 'Invoice';
    const useToddModernInvoice = ownerKey === 'todd' && documentType === 'Invoice';
    const useMoralesInvoice = ownerKey === 'morales' && documentType === 'Invoice';
    const safeDocumentNumber =
      String(documentNumberOverride ?? effectiveDocumentNumber).trim() || '00000000';
    const safeBaseName = `${documentType}_${(activeProperty?.name || 'property')
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '_')}_${safeDocumentNumber}`;
    const pdfFileName = `${safeBaseName}.pdf`;

    const html = useSterlingMechanicalInvoice
      ? buildSterlingMechanicalInvoiceHtml({
          invoiceNumber: safeDocumentNumber,
          docDate: issueDate,
          billTo,
          propertyName: activeProperty?.name || propertyAddress,
          selectedItems,
          laborTotal: sterlingLaborTotal,
          expenses,
          invoicingServices,
          jobTotal,
          totalDue,
          observation,
          attachments: includeInlineInvoicePhotosInPdf ? attachmentsOverride ?? selectedInvoicePhotoAttachments : [],
        })
      : useMoralesInvoice
        ? buildMoralesInvoiceHtml({
            docDate: issueDate,
            customerName,
            customerAddress,
            customerContact,
            selectedItems,
            laborTotal: sterlingLaborTotal,
            expenses,
            invoicingServices,
            jobTotal,
            totalDue,
            observation,
          })
      : useAzeModernInvoice
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
          attachments: includeInlineInvoicePhotosInPdf ? attachmentsOverride ?? selectedInvoicePhotoAttachments : [],
        })
      : useToddModernInvoice
        ? buildToddModernInvoiceHtml({
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
            attachments: includeInlineInvoicePhotosInPdf ? attachmentsOverride ?? selectedInvoicePhotoAttachments : [],
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
  }, [
    activeProperty?.name,
    billTo,
    clientCompany,
    clientName,
    customerAddress,
    customerContact,
    customerName,
    documentType,
    effectiveDocumentNumber,
    expenses,
    firstJobDate,
    includeInlineInvoicePhotosInPdf,
    invoicingServices,
    issueDate,
    jobTotal,
    juanLaborValue,
    materialExpenseValue,
    observation,
    ownerKey,
    propertyAddress,
    propertyCityLine,
    ryanLaborValue,
    selectedInvoicePhotoAttachments,
    selectedItems,
    sterlingLaborTotal,
    timeFrame,
    totalDue,
    lastJobDate,
  ]);

  const buildGeneratedDocumentContentForPdf = useCallback(async (
    documentNumberOverride?: string,
  ): Promise<GeneratedDocumentContent | null> => {
    if (!includeInlineInvoicePhotosInPdf) {
      return buildGeneratedDocumentContent(documentNumberOverride);
    }

    const embeddedAttachments = await inlinePdfAttachmentImages(selectedInvoicePhotoAttachments);
    return buildGeneratedDocumentContent(documentNumberOverride, embeddedAttachments);
  }, [buildGeneratedDocumentContent, includeInlineInvoicePhotosInPdf, selectedInvoicePhotoAttachments]);

  const buildReceiptAppendicesForPdf = useCallback(async (): Promise<GeneratedPdfReceiptAppendix[]> => {
    if (!includeReceiptAppendicesInPdf) {
      return [];
    }

    const appendices = await Promise.all(
      selectedReceiptAttachments.map(async (attachment) => {
        const blob = await fetchAssetBlob(attachment.url);

        return {
          fileName: attachment.fileName,
          mimeType: blob.type || attachment.mimeType,
          blob,
        };
      }),
    );

    return appendices;
  }, [includeReceiptAppendicesInPdf, selectedReceiptAttachments]);

  useEffect(() => {
    if (!documentPreviewOpen) {
      return;
    }

    let cancelled = false;

    void buildGeneratedDocumentContentForPdf().then((documentContent) => {
      if (cancelled) return;
      startTransition(() => {
        setPreviewDocument(documentContent);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [buildGeneratedDocumentContentForPdf, documentPreviewOpen]);

  const previewDocumentKey = previewDocument
    ? [
        ownerKey,
        documentType,
        previewDocument.safeDocumentNumber,
        selectedJobIds.join(','),
        previewDocument.html.length,
      ].join(':')
    : 'empty';

  const openDocumentPreview = async () => {
    if (!selectedItems.length) {
      await onDocumentError?.('Select at least one service before opening the document preview.');
      return;
    }

    if (!effectiveDocumentNumber) {
      await onDocumentError?.('Enter a document number before opening the document preview.');
      return;
    }

    setPreviewDocument(null);
    setDocumentPreviewNotice(null);
    setDocumentPreviewOpen(true);
  };

  const printDocumentPreview = async () => {
    const frameWindow = previewFrameRef.current?.contentWindow;
    if (!previewDocument || !frameWindow) {
      await onDocumentError?.('The preview is not ready yet. Please try again in a moment.');
      return;
    }

    frameWindow.focus();
    frameWindow.print();
  };

  const handleGeneratePdf = async ({ skipConfirmation = false }: { skipConfirmation?: boolean } = {}) => {
    setDocumentPreviewNotice(null);

    if (!selectedItems.length) {
      const message = 'Select at least one service before generating the PDF.';
      setDocumentPreviewNotice({ type: 'error', text: message });
      await onDocumentError?.(message);
      return;
    }

    if (!effectiveDocumentNumber) {
      const message = 'Enter a document number before generating the PDF.';
      setDocumentPreviewNotice({ type: 'error', text: message });
      await onDocumentError?.(message);
      return;
    }

    if (documentNumberExists) {
      const message = `This ${documentType.toLowerCase()} number is already in use. Enter another number.`;
      setDocumentPreviewNotice({ type: 'error', text: message });
      await onDocumentError?.(message);
      return;
    }

    if (skipConfirmation) {
      setDocumentPreviewNotice({ type: 'info', text: 'Generating PDF...' });
      await handleConfirmGeneratePdf();
      return;
    }

    setGeneratePdfConfirmOpen(true);
  };

  const handleConfirmGeneratePdf = async () => {
    setGeneratePdfBusy(true);

    try {
      const generated = await buildGeneratedDocumentContentForPdf();

      if (!generated) {
        setGeneratePdfConfirmOpen(false);
        await onDocumentError?.('Select at least one service before generating the PDF.');
        return;
      }

      const receiptAppendices = await buildReceiptAppendicesForPdf();
      const pdfBlob = await buildGeneratedPdfBlob({
        html: generated.html,
        receiptAppendices,
      });
      const pdfBase64 = await blobToBase64(pdfBlob);
      let saved: SaveGeneratedDocumentResponse | null = null;

      try {
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
        setDocumentPreviewOpen(false);
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
          return;
        }

        throw error;
      }
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 413
          ? 'The PDF is too large to save. Try generating it with fewer attachments.'
          : error instanceof Error
            ? error.message
            : 'Could not save the generated document.';
      setDocumentPreviewNotice({ type: 'error', text: message });
      await onDocumentError?.(message);
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
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="Enter number"
              />
              <small className="muted-copy">
                Enter the invoice or quote number manually.
              </small>
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

            <div className="invoice-attachment-picker span-2">
              <button
                type="button"
                className="invoice-attachment-trigger"
                onClick={() => setAttachmentsOpen((current) => !current)}
                disabled={!allowsPdfAttachments || !hasSelectablePdfAttachments}
              >
                <span>
                  Add attachments to PDF
                  <small>
                    {usesMoralesInvoice
                      ? 'Morales uses the clean invoice-only template.'
                      : selectedAttachmentSummary ||
                      (hasSelectablePdfAttachments
                        ? 'Choose Before, After or Receipts'
                        : 'Select jobs with before, after or receipt files to enable this.')}
                  </small>
                </span>
                <span className={`invoice-services-caret ${attachmentsOpen ? 'is-open' : ''}`}>
                  v
                </span>
              </button>

              {attachmentsOpen && allowsPdfAttachments && hasSelectablePdfAttachments ? (
                <div className="invoice-attachment-menu">
                  {availableAttachmentKinds.map((kind) => {
                    const usesRyanReceiptSelection = ownerKey === 'ryan' && kind === 'receipt';
                    const attachmentsForKind = usesRyanReceiptSelection
                      ? propertyReceiptAttachments
                      : selectedJobAttachments.filter((attachment) => attachment.kind === kind);
                    const selectedCount = usesRyanReceiptSelection
                      ? selectedRyanReceiptAttachments.length
                      : attachmentsForKind.filter((attachment) => selectedAttachmentIdSet.has(attachment.id)).length;
                    const checked = usesRyanReceiptSelection
                      ? allRyanReceiptsSelected
                      : attachmentsForKind.length > 0 && selectedCount === attachmentsForKind.length;
                    const setKindChecked = (nextChecked: boolean) => {
                      if (usesRyanReceiptSelection) {
                        setSelectedRyanReceiptIds(
                          nextChecked ? attachmentsForKind.map((attachment) => attachment.id) : [],
                        );
                        return;
                      }

                      setAttachmentKindSelected(kind, nextChecked);
                    };
                    const setAttachmentChecked = (attachmentId: string, nextChecked: boolean) => {
                      if (!usesRyanReceiptSelection) {
                        setAttachmentSelected(attachmentId, nextChecked);
                        return;
                      }

                      setSelectedRyanReceiptIds((current) => {
                        if (nextChecked) {
                          return current.includes(attachmentId) ? current : [...current, attachmentId];
                        }

                        return current.filter((id) => id !== attachmentId);
                      });
                    };

                    return (
                      <div key={kind} className="invoice-attachment-kind">
                        <div className="invoice-attachment-option invoice-attachment-kind-head">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => setKindChecked(event.target.checked)}
                            disabled={!attachmentsForKind.length}
                          />
                          <button
                            type="button"
                            className="invoice-attachment-kind-toggle"
                            onClick={() => toggleAttachmentKindOpen(kind)}
                            disabled={!attachmentsForKind.length}
                            aria-expanded={expandedAttachmentKinds[kind]}
                          >
                            <span>{attachmentKindLabels[kind]}</span>
                            <span className={`invoice-services-caret ${expandedAttachmentKinds[kind] ? 'is-open' : ''}`}>
                              v
                            </span>
                          </button>
                          <small>
                            {selectedCount} of {attachmentsForKind.length} selected
                          </small>
                        </div>

                        {expandedAttachmentKinds[kind] ? (
                          <div className="invoice-attachment-receipt-list">
                            {attachmentsForKind.map((attachment) => {
                              const isSelected = usesRyanReceiptSelection
                                ? selectedRyanReceiptIds.includes(attachment.id)
                                : selectedAttachmentIdSet.has(attachment.id);

                              return (
                                <label
                                  key={attachment.id}
                                  className="invoice-attachment-option invoice-attachment-option--receipt"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(event) => setAttachmentChecked(attachment.id, event.target.checked)}
                                  />
                                  <span className="invoice-attachment-receipt-meta">
                                    <span>{attachment.label}</span>
                                    <small>{attachment.fileName}</small>
                                  </span>
                                  <small>{formatPdfDate(attachment.createdAt)}</small>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
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
              <p className="invoice-description-note">
                {usesSterlingInvoice
                  ? 'Edit the invoice rows before previewing or generating the PDF.'
                  : usesMoralesInvoice
                    ? 'Edit the invoice rows before previewing or generating the PDF.'
                  : 'You can edit only the description here. We automatically remove list dashes and add a final period.'}
              </p>
            </div>
            <div className="invoice-section-actions">
              <button
                type="button"
                className="ghost-button invoice-services-toggle"
                onClick={() => setIsServicesOpen((current) => !current)}
                aria-expanded={isServicesOpen}
              >
                <span className={`invoice-services-caret ${isServicesOpen ? 'is-open' : ''}`}>
                  {isServicesOpen ? 'v' : '>'}
                </span>
                <span>{isServicesOpen ? 'Hide services' : 'Show services'}</span>
              </button>

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
          </div>

          {isServicesOpen ? (
            <div className="invoice-services-shell">
              <div className="invoice-services-table">
                <div className={`invoice-services-row invoice-services-row--header${usesLineItemInvoice ? ' invoice-services-row--sterling' : ''}`}>
                  <span>Unit</span>
                  <span>Area</span>
                  <span>Service</span>
                  <span>Description</span>
                  {usesLineItemInvoice ? <span>Labor</span> : null}
                  <span>Unit Price (USD)</span>
                </div>

                {invoiceJobGroups.length ? (
                  invoiceJobGroups.map((group) => {
                    const groupJobIds = group.jobs.map((job) => job.id);
                    const selectedGroupCount = group.jobs.filter((job) => selectedJobIds.includes(job.id)).length;
                    const groupChecked = selectedGroupCount === group.jobs.length;
                    const groupedClassName = group.jobs.length > 1 ? ' invoice-services-row--grouped' : '';

                    return (
                      <div
                        key={group.key}
                        className={`invoice-services-row${usesLineItemInvoice ? ' invoice-services-row--sterling' : ''}${groupedClassName}`}
                      >
                        <span className="invoice-services-cell invoice-services-cell--unit">
                          <label className="invoice-service-select">
                            <input
                              className="invoice-service-check"
                              type="checkbox"
                              checked={groupChecked}
                              onChange={() => toggleJobGroupSelection(groupJobIds)}
                            />
                            <span className="invoice-service-select-copy">
                              {renderInvoiceCellValue(group.unit)}
                              {group.jobs.length > 1 ? (
                                <small>{selectedGroupCount} of {group.jobs.length} selected</small>
                              ) : null}
                            </span>
                          </label>
                        </span>
                        <span className="invoice-services-cell invoice-services-cell--area">
                          {renderInvoiceCellValue(group.area)}
                        </span>
                        <span className="invoice-services-cell invoice-services-cell--service">
                          {renderInvoiceCellValue(group.service, 'General Service')}
                        </span>
                        <span className="invoice-services-cell invoice-services-cell--description">
                          <span className="invoice-service-stack">
                            {group.jobs.map((job) => (
                              <textarea
                                key={job.id}
                                className="invoice-description-editor"
                                rows={2}
                                value={descriptionValueFor(job)}
                                onChange={(event) => updateDescriptionEdit(job.id, event.target.value)}
                                onBlur={() => commitDescriptionEdit(job)}
                                placeholder="Edit the description used for this invoice or quote"
                              />
                            ))}
                          </span>
                        </span>
                        {usesLineItemInvoice ? (
                          <span className="invoice-services-cell invoice-services-cell--labor">
                            <span className="invoice-service-value-stack">
                              {group.jobs.map((job) => (
                                <input
                                  key={job.id}
                                  className="invoice-money-editor"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={itemLaborEdits[job.id] ?? String(job.laborCost)}
                                  onChange={(event) =>
                                    setItemLaborEdits((current) => ({
                                      ...current,
                                      [job.id]: event.target.value,
                                    }))
                                  }
                                  aria-label={`Labor for ${displayInvoiceCell(job.service, 'service')}`}
                                />
                              ))}
                            </span>
                          </span>
                        ) : null}
                        <span className="invoice-services-cell invoice-services-cell--price">
                          <span className="invoice-service-value-stack">
                            {group.jobs.map((job) =>
                              usesLineItemInvoice ? (() => {
                                const labor = toAmount(itemLaborEdits[job.id] ?? String(job.laborCost));

                                return (
                                  <input
                                    key={job.id}
                                    className="invoice-money-editor"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={itemUnitPriceEdits[job.id] ?? String(getSterlingUnitPriceFromLabor(job, labor))}
                                    onChange={(event) =>
                                      setItemUnitPriceEdits((current) => ({
                                        ...current,
                                        [job.id]: event.target.value,
                                      }))
                                    }
                                    aria-label={`Unit price for ${displayInvoiceCell(job.service, 'service')}`}
                                  />
                                );
                              })() : (
                                <strong key={job.id} className="invoice-service-price-value">
                                  {formatUsd(job.totalCost)}
                                </strong>
                              ),
                            )}
                          </span>
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-box">Select a property with jobs to generate a preview.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="invoice-services-collapsed">
              <strong>{propertyJobs.length} loaded</strong>
              <span>{displayedSelectedCount} service(s) currently selected for this document.</span>
            </div>
          )}
        </div>

        {usesLineItemInvoice ? (
          <div className="invoice-section-card">
            <div className="invoice-section-head">
              <div>
                <p className="eyebrow">Invoice Adjustments</p>
                <h3 className="title-with-icon title-with-icon--sm">
                  <UiIcon name="dollar" />
                  <span>{usesMoralesInvoice ? 'Morales totals' : 'Ryan totals'}</span>
                </h3>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Expenses (USD)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expensesInput}
                  onChange={(event) => setExpensesInput(event.target.value)}
                />
              </label>

              <label>
                Invoicing Services (USD)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoicingServicesInput}
                  onChange={(event) => setInvoicingServicesInput(event.target.value)}
                />
              </label>

              <label className="span-2">
                Observation
                <textarea
                  rows={4}
                  value={observation}
                  onChange={(event) => setObservation(event.target.value)}
                  placeholder="Optional invoice observation"
                />
              </label>
            </div>
          </div>
        ) : null}

        {usesManualAmounts ? (
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
                Primary Labor (USD)
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
        ) : null}

        <div className="invoice-section-card">
          {usesManualAmounts ? (
            <p className="invoice-preview-note">Advance Payment is used only to compute Total Due.</p>
          ) : null}

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
            <div className="invoice-generate-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => void openDocumentPreview()}
                disabled={!selectedItems.length}
              >
                <UiIcon name="receipt" />
                Preview document
              </button>
              <button
                type="button"
                className="invoice-generate-button"
                onClick={() => void handleGeneratePdf()}
                disabled={!selectedItems.length || !effectiveDocumentNumber || generatePdfBusy}
              >
                <UiIcon name="file" />
                {generatePdfBusy ? 'Generating...' : 'Generate PDF'}
              </button>
            </div>
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
                onChange={(event) => setHistoryOwner(event.target.value as DocumentOwnerFilter)}
              >
                <option value="ALL">All owners</option>
                <option value="AZE">AZE</option>
                <option value="RYAN">Ryan Goertler</option>
                <option value="TODD">Todd Goertler</option>
                <option value="MORALES">Morales Home Improvement</option>
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
                        {canDelete ? (
                          <button
                            type="button"
                            className="ghost-button records-action-button danger"
                            onClick={() =>
                              onDeleteDocument(document.id, {
                                kind: document.documentTypeLabel,
                                documentNumber: document.documentNumber,
                                fileName: document.fileName,
                              })
                            }
                          >
                            <UiIcon name="trash" size={15} />
                            Delete
                          </button>
                        ) : null}
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
            ? `Invoice ${effectiveDocumentNumber} will be issued and downloaded as a PDF file.`
            : `Quote ${effectiveDocumentNumber} will be generated and downloaded as a PDF file.`
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

      {documentPreviewOpen && previewDocument ? (
        <div
          className="document-preview-backdrop"
          role="presentation"
          onClick={() => setDocumentPreviewOpen(false)}
        >
          <div
            className="document-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-document-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="document-preview-head">
              <div className="document-preview-head-copy">
                <p className="eyebrow">Live document preview</p>
                <h2 id="invoice-document-preview-title">
                  {documentType} {previewDocument.safeDocumentNumber}
                </h2>
                <p>{activeProperty?.name || 'Selected property'}</p>
              </div>

              <button
                type="button"
                className="ghost-button"
                onClick={() => setDocumentPreviewOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="document-preview-body">
              <div className="document-preview-stage">
                <iframe
                  key={previewDocumentKey}
                  ref={previewFrameRef}
                  className="document-preview-frame"
                  srcDoc={previewDocument.html}
                  title={`${documentType} preview for ${activeProperty?.name || 'property'}`}
                />
              </div>

              <aside className="document-preview-sidebar">
                <div className="document-preview-meta-grid">
                  <article className="document-preview-meta-card">
                    <span>No.</span>
                    <strong>{previewDocument.safeDocumentNumber}</strong>
                  </article>
                  <article className="document-preview-meta-card">
                    <span>Type</span>
                    <strong>{documentType}</strong>
                  </article>
                  <article className="document-preview-meta-card">
                    <span>Owner</span>
                    <strong>{ownerLabel}</strong>
                  </article>
                  <article className="document-preview-meta-card">
                    <span>Date</span>
                    <strong>{formatPdfDate(issueDate)}</strong>
                  </article>
                  <article className="document-preview-meta-card document-preview-meta-card--wide">
                    <span>Property</span>
                    <strong>{activeProperty?.name || '-'}</strong>
                    <small>{[propertyAddress, propertyCityLine].filter(Boolean).join(', ') || '-'}</small>
                  </article>
                  <article className="document-preview-meta-card document-preview-meta-card--wide">
                    <span>Services selected</span>
                    <strong>{selectedItems.length}</strong>
                    <small>Total due: {formatUsd(totalDue)}</small>
                  </article>
                </div>

                {documentPreviewNotice ? (
                  <div className={`document-preview-notice document-preview-notice--${documentPreviewNotice.type}`}>
                    {documentPreviewNotice.text}
                  </div>
                ) : null}

                <div className="document-preview-actions">
                  <button type="button" className="ghost-button" onClick={() => void printDocumentPreview()}>
                    <UiIcon name="receipt" size={15} />
                    Print preview
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleGeneratePdf({ skipConfirmation: true })}
                    disabled={generatePdfBusy}
                  >
                    <UiIcon name="download" size={15} />
                    {generatePdfBusy ? 'Generating...' : 'Generate PDF'}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
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

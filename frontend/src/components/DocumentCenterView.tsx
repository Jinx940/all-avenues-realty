import { useEffect, useMemo, useState } from 'react';
import { buildAssetUrl } from '../lib/api';
import { formatJobLocationSummary } from '../lib/jobLocation';
import type { GeneratedDocumentHistoryItem, JobRow, PropertySummary } from '../types';
import { ProtectedAssetFrame } from './ProtectedAssetFrame';
import { ProtectedAssetImage } from './ProtectedAssetImage';
import { UiIcon } from './UiIcon';

type DocumentCenterItem = {
  id: string;
  kind: 'Invoice' | 'Quote' | 'Receipt';
  ownerLabel: string;
  documentNumber: string;
  propertyId: string;
  propertyName: string;
  fileName: string;
  issueDate: string | null;
  createdAt: string;
  linkedJobCount: number;
  linkedJobSummary: string;
  openUrl: string;
  downloadUrl: string;
  jobId?: string;
  fileId?: string;
  documentId?: string;
};

type DocumentPreviewMode = 'image' | 'pdf' | 'frame' | 'unsupported';

const documentKindClassFor = (kind: DocumentCenterItem['kind']) => `document-kind-pill document-kind-pill--${kind.toLowerCase()}`;

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
};

const matchesDateRange = (value: string | null, range: string) => {
  if (!range || range === 'ALL') return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = date.getTime() - startOfToday.getTime();
  const diffDays = Math.floor(diff / 86400000);

  if (range === 'TODAY') return diffDays === 0;
  if (range === '7') return diffDays >= -7 && diffDays <= 0;
  if (range === '30') return diffDays >= -30 && diffDays <= 0;
  return true;
};

const triggerDownload = (url: string, fileName: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const getDocumentExtension = (value: string) => {
  const cleaned = value.split('?')[0].split('#')[0];
  const lastChunk = cleaned.split('/').pop() ?? cleaned;
  const extension = lastChunk.includes('.') ? lastChunk.split('.').pop() : '';
  return (extension ?? '').trim().toLowerCase();
};

const getDocumentPreviewMode = (item: DocumentCenterItem): DocumentPreviewMode => {
  const extension = getDocumentExtension(item.fileName) || getDocumentExtension(item.openUrl);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(extension)) {
    return 'image';
  }

  if (extension === 'pdf') {
    return 'pdf';
  }

  if (['html', 'htm'].includes(extension)) {
    return 'frame';
  }

  return item.kind === 'Receipt' ? 'unsupported' : 'frame';
};

const getDocumentDisplayName = (item: DocumentCenterItem) => {
  if (item.kind === 'Receipt') {
    return item.fileName;
  }

  return item.fileName.replace(/\.(html?|pdf)$/i, '');
};

export function DocumentCenterView({
  properties,
  jobs,
  documents,
  canDelete,
  onDeleteReceipt,
  onDeleteDocument,
}: {
  properties: PropertySummary[];
  jobs: JobRow[];
  documents: GeneratedDocumentHistoryItem[];
  canDelete: boolean;
  onDeleteReceipt: (jobId: string, fileId: string, fileName: string) => void;
  onDeleteDocument: (
    documentId: string,
    options: { kind: 'Invoice' | 'Quote'; documentNumber: string; fileName: string },
  ) => void;
}) {
  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [kind, setKind] = useState<'ALL' | 'Invoice' | 'Quote' | 'Receipt'>('ALL');
  const [owner, setOwner] = useState<'ALL' | 'AZE' | 'Ryan'>('ALL');
  const [dateRange, setDateRange] = useState<'ALL' | 'TODAY' | '7' | '30'>('ALL');
  const [previewItem, setPreviewItem] = useState<DocumentCenterItem | null>(null);

  const items = useMemo<DocumentCenterItem[]>(() => {
    const generatedItems = documents.map<DocumentCenterItem>((document) => ({
      id: document.id,
      kind: document.documentTypeLabel,
      ownerLabel: document.ownerLabel,
      documentNumber: document.documentNumber,
      propertyId: document.propertyId,
      propertyName: document.propertyName,
      fileName: document.fileName,
      issueDate: document.issueDate ?? document.createdAt,
      createdAt: document.createdAt,
      linkedJobCount: document.linkedJobCount,
      linkedJobSummary: document.linkedJobs
        .map((job) => formatJobLocationSummary(job.story, job.unit, job.area, job.service))
        .slice(0, 3)
        .join(' | '),
      openUrl: buildAssetUrl(document.url),
      downloadUrl: buildAssetUrl(document.url),
      documentId: document.id,
    }));

    const receiptItems = jobs.flatMap<DocumentCenterItem>((job) =>
      job.files.receipt.map((file) => ({
        id: file.id,
        kind: 'Receipt',
        ownerLabel: '-',
        documentNumber: file.documentNumber?.trim() || '-',
        propertyId: job.propertyId,
        propertyName: job.propertyName,
        fileName: file.name,
        issueDate: file.createdAt,
        createdAt: file.createdAt,
        linkedJobCount: 1,
        linkedJobSummary: formatJobLocationSummary(job.story, job.unit, job.area, job.service),
        openUrl: buildAssetUrl(file.url),
        downloadUrl: buildAssetUrl(file.url),
        jobId: job.id,
        fileId: file.id,
      })),
    );

    return [...generatedItems, ...receiptItems].sort((left, right) => {
      const leftTime = new Date(left.issueDate ?? left.createdAt).getTime();
      const rightTime = new Date(right.issueDate ?? right.createdAt).getTime();
      return rightTime - leftTime;
    });
  }, [documents, jobs]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const displayName = getDocumentDisplayName(item);
      if (propertyId && item.propertyId !== propertyId) return false;
      if (kind !== 'ALL' && item.kind !== kind) return false;
      if (owner !== 'ALL' && item.ownerLabel !== owner && item.kind !== 'Receipt') return false;
      if (!matchesDateRange(item.issueDate ?? item.createdAt, dateRange)) return false;

      if (!term) return true;
      const haystack = [
        item.documentNumber,
        displayName,
        item.propertyName,
        item.kind,
        item.ownerLabel,
        item.linkedJobSummary,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search, propertyId, kind, owner, dateRange]);

  const stats = {
    total: filteredItems.length,
    invoices: filteredItems.filter((item) => item.kind === 'Invoice').length,
    quotes: filteredItems.filter((item) => item.kind === 'Quote').length,
    receipts: filteredItems.filter((item) => item.kind === 'Receipt').length,
  };

  const handleDeleteItem = (item: DocumentCenterItem) => {
    if (item.kind === 'Receipt') {
      if (!item.jobId || !item.fileId) return;
      onDeleteReceipt(item.jobId, item.fileId, item.fileName);
      return;
    }

    if (!item.documentId) return;
    onDeleteDocument(item.documentId, {
      kind: item.kind,
      documentNumber: item.documentNumber,
      fileName: item.fileName,
    });
  };

  return (
    <section className="tab-panel">
      <div className="panel document-center-shell">
        <div className="document-center-head">
          <div>
            <p className="page-kicker">Document Center</p>
            <h2 className="title-with-icon">
              <UiIcon name="file" />
              <span>Document Center</span>
            </h2>
            <p>Search invoices, quotes and receipts in one place, then open them again.</p>
          </div>
        </div>

        <div className="document-center-stats">
          <article className="document-stat-card">
            <span className="eyebrow">Visible documents</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="document-stat-card">
            <span className="eyebrow">Invoices</span>
            <strong>{stats.invoices}</strong>
          </article>
          <article className="document-stat-card">
            <span className="eyebrow">Quotes</span>
            <strong>{stats.quotes}</strong>
          </article>
          <article className="document-stat-card">
            <span className="eyebrow">Receipts</span>
            <strong>{stats.receipts}</strong>
          </article>
        </div>

        <div className="shell-section-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">History filters</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="search" />
                <span>Find documents fast</span>
              </h3>
            </div>
          </div>

          <div className="document-center-filters">
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search No., file, property or job..."
              />
            </label>

            <label>
              Property
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                <option value="">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Document Type
              <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="ALL">All</option>
                <option value="Invoice">Invoice</option>
                <option value="Quote">Quote</option>
                <option value="Receipt">Receipt</option>
              </select>
            </label>

            <label>
              Owner
              <select value={owner} onChange={(event) => setOwner(event.target.value as typeof owner)}>
                <option value="ALL">All</option>
                <option value="AZE">AZE</option>
                <option value="Ryan">Ryan</option>
              </select>
            </label>

            <label>
              Date Range
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)}>
                <option value="ALL">All time</option>
                <option value="TODAY">Today</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </label>
          </div>
        </div>

        <div className="shell-section-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Unified document list</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="folder" />
                <span>{filteredItems.length} item(s) found</span>
              </h3>
            </div>
          </div>

          <div className="document-center-table-shell">
            <div className="document-center-table document-center-row document-center-row--header">
              <span>No.</span>
              <span>Type</span>
              <span>Owner</span>
              <span>Property</span>
              <span>Date</span>
              <span>Linked Jobs</span>
              <span>Actions</span>
            </div>

            {filteredItems.length ? (
              filteredItems.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="document-center-table document-center-row">
                  <span className="document-center-number">{item.documentNumber}</span>
                  <span>
                    <span className={`pill ${documentKindClassFor(item.kind)}`}>
                      {item.kind}
                    </span>
                  </span>
                  <span>{item.ownerLabel}</span>
                  <span>
                    <strong>{item.propertyName}</strong>
                    <small>{getDocumentDisplayName(item)}</small>
                  </span>
                  <span>{formatDate(item.issueDate ?? item.createdAt)}</span>
                  <span>
                    <strong>{item.linkedJobCount}</strong>
                    <small>{item.linkedJobSummary || '-'}</small>
                  </span>
                  <span className="document-center-actions">
                    <button type="button" className="ghost-button" onClick={() => setPreviewItem(item)}>
                      <UiIcon name="file" size={15} />
                      Open
                    </button>
                    {canDelete ? (
                      <button type="button" className="ghost-button danger" onClick={() => handleDeleteItem(item)}>
                        <UiIcon name="trash" size={15} />
                        Delete
                      </button>
                    ) : null}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-box">No documents found with the current filters.</div>
            )}
          </div>
        </div>

        <DocumentPreviewDialog
          item={previewItem}
          canDelete={canDelete}
          onDelete={() => {
            if (!previewItem) return;
            handleDeleteItem(previewItem);
            setPreviewItem(null);
          }}
          onClose={() => setPreviewItem(null)}
        />
      </div>
    </section>
  );
}

function DocumentPreviewDialog({
  item,
  canDelete,
  onDelete,
  onClose,
}: {
  item: DocumentCenterItem | null;
  canDelete: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, onClose]);

  if (!item) return null;

  const previewMode = getDocumentPreviewMode(item);
  const displayName = getDocumentDisplayName(item);
  return (
    <div className="document-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        className="document-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="document-preview-head">
          <div className="document-preview-head-copy">
            <p className="eyebrow">Document preview</p>
            <h2 id="document-preview-title">{displayName}</h2>
            <p>{item.propertyName}</p>
          </div>

          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="document-preview-body">
          <div className="document-preview-stage">
            {previewMode === 'image' ? (
              <ProtectedAssetImage
                className="document-preview-image"
                src={item.openUrl}
                alt={displayName}
                loadingFallback={
                  <div className="document-preview-empty">
                    <strong>Loading image preview...</strong>
                    <span>Please wait while the saved file opens.</span>
                  </div>
                }
                errorFallback={(message) => (
                  <div className="document-preview-empty">
                    <strong>Could not load this image preview</strong>
                    <span>{message}</span>
                  </div>
                )}
              />
            ) : previewMode === 'pdf' ? (
              <ProtectedAssetFrame
                className="document-preview-frame"
                src={item.openUrl}
                title={`Preview for ${displayName}`}
                mimeType="application/pdf"
                loadingFallback={
                  <div className="document-preview-empty">
                    <strong>Loading PDF preview...</strong>
                    <span>Please wait while the saved file opens.</span>
                  </div>
                }
                errorFallback={(message) => (
                  <div className="document-preview-empty">
                    <strong>Could not load this PDF preview</strong>
                    <span>{message}</span>
                  </div>
                )}
              />
            ) : previewMode === 'frame' ? (
              <ProtectedAssetFrame
                className="document-preview-frame"
                src={item.openUrl}
                title={`Preview for ${displayName}`}
                mimeType="text/html"
                loadingFallback={
                  <div className="document-preview-empty">
                    <strong>Loading document preview...</strong>
                    <span>Please wait while the saved file opens.</span>
                  </div>
                }
                errorFallback={(message) => (
                  <div className="document-preview-empty">
                    <strong>Could not load this document preview</strong>
                    <span>{message}</span>
                  </div>
                )}
              />
            ) : (
              <div className="document-preview-empty">
                <strong>Preview not available</strong>
                <span>This file type cannot be rendered inline yet. Use Download to inspect it.</span>
              </div>
            )}
          </div>

          <aside className="document-preview-sidebar">
            <div className="document-preview-meta-grid">
              <article className="document-preview-meta-card">
                <span>No.</span>
                <strong>{item.documentNumber}</strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Type</span>
                <strong>
                  <span className={`pill ${documentKindClassFor(item.kind)}`}>{item.kind}</span>
                </strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Owner</span>
                <strong>{item.ownerLabel}</strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Date</span>
                <strong>{formatDate(item.issueDate ?? item.createdAt)}</strong>
              </article>
              <article className="document-preview-meta-card document-preview-meta-card--wide">
                <span>Property</span>
                <strong>{item.propertyName}</strong>
              </article>
              <article className="document-preview-meta-card document-preview-meta-card--wide">
                <span>Linked jobs</span>
                <strong>{item.linkedJobCount}</strong>
                <small>{item.linkedJobSummary || '-'}</small>
              </article>
            </div>

            <div className="document-preview-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => triggerDownload(item.downloadUrl, item.fileName)}
              >
                <UiIcon name="download" size={15} />
                Download
              </button>
              {canDelete ? (
                <button type="button" className="ghost-button danger" onClick={onDelete}>
                  <UiIcon name="trash" size={15} />
                  Delete
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

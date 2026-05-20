import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatMoney } from '../lib/format';
import { formatAreaServiceLabel } from '../lib/jobLocation';
import type { GeneratedDocumentHistoryItem, JobRow, PropertySummary, WorkerSummary } from '../types';
import { UiIcon, type UiIconName } from './UiIcon';

type SearchResult =
  | {
      id: string;
      kind: 'job';
      title: string;
      detail: string;
      meta: string;
      icon: UiIconName;
      job: JobRow;
    }
  | {
      id: string;
      kind: 'property';
      title: string;
      detail: string;
      meta: string;
      icon: UiIconName;
      property: PropertySummary;
    }
  | {
      id: string;
      kind: 'document';
      title: string;
      detail: string;
      meta: string;
      icon: UiIconName;
      document: GeneratedDocumentHistoryItem;
    }
  | {
      id: string;
      kind: 'worker';
      title: string;
      detail: string;
      meta: string;
      icon: UiIconName;
      worker: WorkerSummary;
    };

const searchResultKindLabel: Record<SearchResult['kind'], string> = {
  job: 'Job',
  property: 'Property',
  document: 'Document',
  worker: 'Worker',
};

export function GlobalSearch({
  jobs,
  properties,
  documents,
  workers,
  onOpenJob,
  onOpenProperty,
  onOpenDocument,
  onOpenWorker,
}: {
  jobs: JobRow[];
  properties: PropertySummary[];
  documents: GeneratedDocumentHistoryItem[];
  workers: WorkerSummary[];
  onOpenJob: (job: JobRow) => void;
  onOpenProperty: (property: PropertySummary) => void;
  onOpenDocument: (document: GeneratedDocumentHistoryItem) => void;
  onOpenWorker: (worker: WorkerSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];

    const jobResults: SearchResult[] = jobs.map((job) => ({
      id: `job:${job.id}`,
      kind: 'job' as const,
      title: formatAreaServiceLabel(job.area, job.service),
      detail: job.propertyName,
      meta: `${job.statusLabel} - ${formatMoney(job.totalCost)}`,
      icon: 'activity' as const,
      job,
    }));

    const propertyResults: SearchResult[] = properties.map((property) => ({
      id: `property:${property.id}`,
      kind: 'property' as const,
      title: property.name,
      detail: [property.address, property.cityLine].filter(Boolean).join(', ') || 'No address',
      meta: `${property.openJobs} open / ${property.lateJobs} late`,
      icon: 'home' as const,
      property,
    }));

    const documentResults: SearchResult[] = documents.map((document) => ({
      id: `document:${document.id}`,
      kind: 'document' as const,
      title: `${document.documentTypeLabel} ${document.documentNumber}`,
      detail: document.propertyName,
      meta: formatDate(document.issueDate ?? document.createdAt),
      icon: 'file' as const,
      document,
    }));

    const workerResults: SearchResult[] = workers.map((worker) => ({
      id: `worker:${worker.id}`,
      kind: 'worker' as const,
      title: worker.name,
      detail: worker.statusLabel,
      meta: `${worker.totalJobCount} job${worker.totalJobCount === 1 ? '' : 's'}`,
      icon: 'users' as const,
      worker,
    }));

    return [...jobResults, ...propertyResults, ...documentResults, ...workerResults]
      .filter((result) =>
        [result.title, result.detail, result.meta, searchResultKindLabel[result.kind]]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 10);
  }, [documents, jobs, properties, query, workers]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const openResult = (result: SearchResult) => {
    setIsOpen(false);
    setQuery('');

    if (result.kind === 'job') {
      onOpenJob(result.job);
      return;
    }
    if (result.kind === 'property') {
      onOpenProperty(result.property);
      return;
    }
    if (result.kind === 'document') {
      onOpenDocument(result.document);
      return;
    }
    onOpenWorker(result.worker);
  };

  return (
    <div className="global-search" ref={rootRef}>
      <label className="global-search-field">
        <UiIcon name="search" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search jobs, properties, documents..."
        />
      </label>

      {isOpen && query.trim().length >= 2 ? (
        <div className="global-search-panel" role="dialog" aria-label="Global search results">
          {results.length ? (
            results.map((result) => (
              <button key={result.id} type="button" className="global-search-row" onClick={() => openResult(result)}>
                <span className="global-search-icon">
                  <UiIcon name={result.icon} />
                </span>
                <span className="global-search-copy">
                  <small>{searchResultKindLabel[result.kind]}</small>
                  <strong>{result.title}</strong>
                  <em>{result.detail}</em>
                </span>
                <span className="global-search-meta">{result.meta}</span>
              </button>
            ))
          ) : (
            <div className="global-search-empty">No results found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { buildAssetUrl, requestJson } from '../lib/api';
import { formatDate } from '../lib/format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from '../lib/jobLocation';
import type { PropertySummary, PublicClientPortalPayload } from '../types';
import { UiIcon } from './UiIcon';

const portalLinkFor = (propertyId: string) => {
  if (typeof window === 'undefined') return `/client/${encodeURIComponent(propertyId)}`;
  return `${window.location.origin}/client/${encodeURIComponent(propertyId)}`;
};

const portalFileImage = (files: PublicClientPortalPayload['jobs'][number]['files'][keyof PublicClientPortalPayload['jobs'][number]['files']]) =>
  files.find((file) => String(file.mimeType).toLowerCase().startsWith('image/')) ?? null;

function ClientPortalJobCard({ job }: { job: PublicClientPortalPayload['jobs'][number] }) {
  const beforeImage = portalFileImage(job.files.before);
  const progressImage = portalFileImage(job.files.progress);
  const afterImage = portalFileImage(job.files.after);
  const evidence = [
    { label: 'Before', file: beforeImage },
    { label: 'Progress', file: progressImage },
    { label: 'After', file: afterImage },
  ];

  return (
    <article className={`public-portal-job public-portal-job--tone-${job.timeline.tone}`}>
      <div className="public-portal-job-head">
        <div>
          <span className="eyebrow">{[formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' / ') || 'Project'}</span>
          <h3>{formatAreaServiceLabel(job.area, job.service)}</h3>
          <p>{job.description || 'Work item registered in the project tracker.'}</p>
        </div>
        <span className={`pill tone-${job.timeline.tone}`}>{job.statusLabel}</span>
      </div>

      <div className="public-portal-job-meta">
        <span>
          <small>Start</small>
          <strong>{formatDate(job.startDate)}</strong>
        </span>
        <span>
          <small>Due</small>
          <strong>{formatDate(job.dueDate)}</strong>
        </span>
        <span>
          <small>Timeline</small>
          <strong>{job.timeline.label}</strong>
        </span>
      </div>

      <div className="public-portal-evidence-grid">
        {evidence.map((item) => (
          <div key={item.label} className="public-portal-evidence-card">
            {item.file ? (
              <img src={buildAssetUrl(item.file.url)} alt={`${item.label} evidence`} />
            ) : (
              <div className="public-portal-evidence-empty">
                <UiIcon name="image" />
              </div>
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export function PublicClientPortalView({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<{
    propertyId: string;
    payload: PublicClientPortalPayload | null;
    error: string;
    loading: boolean;
  }>({
    propertyId: '',
    payload: null,
    error: '',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    void requestJson<PublicClientPortalPayload>(`/api/client-portal/${encodeURIComponent(propertyId)}`)
      .then((data) => {
        if (!cancelled) {
          setState({
            propertyId,
            payload: data,
            error: '',
            loading: false,
          });
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setState({
            propertyId,
            payload: null,
            error: requestError instanceof Error ? requestError.message : 'Could not load the client portal.',
            loading: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const loading = state.loading || state.propertyId !== propertyId;
  const payload = state.propertyId === propertyId ? state.payload : null;
  const error = state.propertyId === propertyId ? state.error : '';

  if (loading) {
    return <main className="public-portal-shell public-portal-loading">Loading client portal...</main>;
  }

  if (error || !payload) {
    return (
      <main className="public-portal-shell public-portal-error">
        <div className="public-portal-error-card">
          <UiIcon name="lock" size={26} />
          <h1>Portal unavailable</h1>
          <p>{error || 'The requested project portal could not be loaded.'}</p>
        </div>
      </main>
    );
  }

  const coverUrl = payload.property.coverImageUrl ? buildAssetUrl(payload.property.coverImageUrl) : '';

  return (
    <main className="public-portal-shell">
      <section className="public-portal-hero">
        {coverUrl ? <img src={coverUrl} alt="" /> : null}
        <div className="public-portal-hero-shade" />
        <div className="public-portal-hero-copy">
          <span>All Avenues Realty</span>
          <h1>{payload.property.name}</h1>
          <p>{[payload.property.address, payload.property.cityLine].filter(Boolean).join(', ')}</p>
        </div>
      </section>

      <section className="public-portal-content">
        <div className="public-portal-summary-grid">
          <span>
            <strong>{payload.summary.totalJobs}</strong>
            <small>Total jobs</small>
          </span>
          <span>
            <strong>{payload.summary.completedJobs}</strong>
            <small>Completed</small>
          </span>
          <span>
            <strong>{payload.summary.openJobs}</strong>
            <small>Open</small>
          </span>
          <span>
            <strong>{payload.summary.completionRate}%</strong>
            <small>Progress</small>
          </span>
        </div>

        <div className="public-portal-progress">
          <span style={{ width: `${payload.summary.completionRate}%` }} />
        </div>

        <section className="public-portal-section">
          <div className="public-portal-section-head">
            <div>
              <span>Project Status</span>
              <h2>Work Progress</h2>
            </div>
            <small>Updated {formatDate(payload.updatedAt)}</small>
          </div>

          <div className="public-portal-job-list">
            {payload.jobs.length ? (
              payload.jobs.map((job) => <ClientPortalJobCard key={job.id} job={job} />)
            ) : (
              <div className="public-portal-empty">No project jobs are ready for the portal yet.</div>
            )}
          </div>
        </section>

        <section className="public-portal-section">
          <div className="public-portal-section-head">
            <div>
              <span>Documents</span>
              <h2>Invoices And Quotes</h2>
            </div>
          </div>
          <div className="public-portal-documents">
            {payload.documents.length ? (
              payload.documents.map((document) => (
                <a key={document.id} href={buildAssetUrl(document.url)} target="_blank" rel="noreferrer">
                  <UiIcon name="file" />
                  <span>
                    <strong>{document.documentTypeLabel} {document.documentNumber}</strong>
                    <small>{document.fileName} - {formatDate(document.issueDate ?? document.createdAt)}</small>
                  </span>
                </a>
              ))
            ) : (
              <div className="public-portal-empty">No shared documents yet.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export function ClientPortalView({
  properties,
  selectedPropertyId,
}: {
  properties: PropertySummary[];
  selectedPropertyId: string;
}) {
  const [chosenPropertyId, setChosenPropertyId] = useState('');
  const [copyState, setCopyState] = useState('');
  const fallbackPropertyId = selectedPropertyId || properties[0]?.id || '';
  const propertyId =
    chosenPropertyId && properties.some((property) => property.id === chosenPropertyId)
      ? chosenPropertyId
      : fallbackPropertyId;

  const portalUrl = useMemo(() => (propertyId ? portalLinkFor(propertyId) : ''), [propertyId]);

  const copyPortalLink = async () => {
    if (!portalUrl) return;

    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopyState('Link copied');
    } catch {
      setCopyState('Copy unavailable');
    }
  };

  return (
    <section className="tab-panel client-portal-manager-shell">
      <div className="panel client-portal-manager-hero">
        <div>
          <p className="page-kicker">Client Portal</p>
          <h2 className="title-with-icon">
            <UiIcon name="eye" />
            <span>Shareable Project View</span>
          </h2>
          <p>Generate a clean client-facing view with progress photos, status and saved documents.</p>
        </div>
        <button type="button" className="primary-action-button" onClick={copyPortalLink} disabled={!portalUrl}>
          <UiIcon name="file" />
          {copyState || 'Copy portal link'}
        </button>
      </div>

      <div className="panel client-portal-controls">
        <label>
          Property
          <select value={propertyId} onChange={(event) => setChosenPropertyId(event.target.value)}>
            <option value="">Select a property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Client link
          <input value={portalUrl} readOnly />
        </label>
        {portalUrl ? (
          <a className="ghost-button client-portal-open-link" href={portalUrl} target="_blank" rel="noreferrer">
            <UiIcon name="eye" />
            Open portal
          </a>
        ) : null}
      </div>

      <div className="panel client-portal-preview-shell">
        {propertyId ? (
          <iframe title="Client portal preview" src={`/client/${encodeURIComponent(propertyId)}`} />
        ) : (
          <div className="empty-box">Select a property to preview the client portal.</div>
        )}
      </div>
    </section>
  );
}

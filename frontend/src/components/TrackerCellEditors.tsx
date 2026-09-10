import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { calendarDate, isoCalendarDate, labelTextColor, rangeDayCount, trackerSummary, type TrackerSummaryMode } from '../lib/jobTracker';
import type { JobRow, TrackerJobUpdate, TrackerLabel } from '../types';
import { UiIcon } from './UiIcon';
import './TrackerCellEditors.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar. Inténtalo de nuevo.';
const labelStyle = (label: TrackerLabel): CSSProperties => ({ '--jt-status-bg': label.color, '--jt-status-ink': labelTextColor(label.color) } as CSSProperties);

export function TrackerPopover({ anchor, title, compact = false, onClose, children }: {
  anchor: HTMLElement; title: string; compact?: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  useLayoutEffect(() => { closeRef.current = onClose; });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(bounds.left + bounds.width / 2 - element.offsetWidth / 2, window.innerWidth - element.offsetWidth - 8));
      const below = bounds.bottom + 9;
      const top = below + element.offsetHeight < window.innerHeight - 8 ? below : Math.max(8, bounds.top - element.offsetHeight - 9);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    element.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !anchor.contains(event.target as Node)) closeRef.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const fields = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
        const first = fields[0]; const last = fields.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('pointerdown', outside);
    element.addEventListener('keydown', keyboard);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside);
      element.removeEventListener('keydown', keyboard);
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);
  return createPortal(<div ref={ref} className={`jt-popover${compact ? ' jt-popover--summary' : ''}`} role="dialog" aria-label={compact ? title : undefined} aria-labelledby={compact ? undefined : titleId}>
    {compact ? null : <div className="jt-popover-title"><strong id={titleId}>{title}</strong><button type="button" aria-label="Cerrar menú" onClick={onClose}><UiIcon name="close" size={15} /></button></div>}
    {children}
  </div>, document.body);
}

export function TrackerLabelCell({ kind, job, labels, canManage, onUpdate, onLabelsChange }: {
  kind: TrackerLabel['kind']; job: JobRow; labels: TrackerLabel[]; canManage: boolean;
  onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
  onLabelsChange: (labels: TrackerLabel[]) => Promise<void>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TrackerLabel[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const options = labels.filter((label) => label.kind === kind);
  const value = kind === 'status' ? job.status : job.priority ?? 'NONE';
  const selected = options.find((option) => option.value === value) ?? { kind, value, label: value, color: '#c4c4c4' };
  const title = kind === 'status' ? 'Estado' : 'Prioridad';
  const close = () => { if (!saving) { setAnchor(null); setError(''); setEditing(false); } };
  const save = async (action: () => Promise<void>) => {
    setSaving(true); setError('');
    try { await action(); setAnchor(null); setEditing(false); }
    catch (failure) { setError(errorText(failure)); }
    finally { setSaving(false); }
  };
  return <td className="jt-status jt-editable-label" style={labelStyle(selected)}>
    {canManage ? <button type="button" aria-label={`Cambiar ${title.toLowerCase()}: ${job.service}`} aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      onClick={(event) => { setAnchor(event.currentTarget); setError(''); }}>
      {selected.label}
    </button> : <span>{selected.label}</span>}
    {anchor ? <TrackerPopover anchor={anchor} title={editing ? `Editar etiquetas de ${title.toLowerCase()}` : title} onClose={close}>
      {editing ? <form className="jt-label-form" onSubmit={(event) => { event.preventDefault(); void save(() => onLabelsChange(draft)); }}>
        <p>Los nombres y colores se aplican a todos los trabajos del tablero.</p>
        {draft.map((label, index) => <div className="jt-label-edit-row" key={label.value}>
          <input type="color" value={label.color} aria-label={`Color de ${label.value}`} disabled={saving}
            onChange={(event) => setDraft((items) => items.map((item, position) => position === index ? { ...item, color: event.target.value } : item))} />
          <input value={label.label} required maxLength={40} aria-label={`Nombre de ${label.value}`} disabled={saving}
            onChange={(event) => setDraft((items) => items.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} />
        </div>)}
        <div className="jt-editor-actions"><button type="button" onClick={() => setEditing(false)} disabled={saving}>Volver</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar etiquetas'}</button></div>
      </form> : <>
        <div className="jt-label-options" role="group" aria-label={title}>
          {options.map((option) => <button key={option.value} type="button" style={labelStyle(option)} aria-pressed={value === option.value} disabled={saving}
            onClick={() => {
              if (option.value === value) { close(); return; }
              void save(() => onUpdate(job, kind === 'status' ? { status: option.value } : { priority: option.value === 'NONE' ? null : option.value as JobRow['priority'] }));
            }}>{option.label}{value === option.value ? <span aria-hidden="true">✓</span> : null}</button>)}
        </div>
        {saving ? <p role="status">Guardando…</p> : null}
        <button type="button" className="jt-edit-labels" disabled={saving} onClick={() => { setDraft(options.map((label) => ({ ...label }))); setEditing(true); }}><UiIcon name="file" size={15} />Editar etiquetas</button>
      </>}
      {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
    </TrackerPopover> : null}
  </td>;
}

export function TrackerTimelineCell({ job, canManage, onUpdate }: {
  job: JobRow; canManage: boolean; onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const short = (date: string | null) => date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date)) : 'Sin fecha';
  const text = !job.startDate && !job.dueDate ? 'Sin fechas' : `${short(job.startDate)} – ${short(job.dueDate)}`;
  const days = rangeDayCount(job.startDate?.slice(0, 10) ?? '', job.dueDate?.slice(0, 10) ?? '');
  const className = `jt-timeline ${job.status === 'DONE' ? 'jt-timeline--done' : job.timeline.isLate ? 'jt-timeline--late' : ''}`;
  const content = <span className={className}><span className="jt-timeline-dates">{text}</span>{days > 0 ? <span className="jt-timeline-days">{days}d</span> : null}</span>;
  return <td className={`jt-data-cell jt-timeline-cell${days > 0 ? ' jt-has-duration' : ''}`} title={days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : text}>
    {canManage ? <button type="button" className="jt-cell-button" aria-haspopup="dialog" aria-expanded={Boolean(anchor)} aria-label={`Editar cronograma: ${job.service}`} onClick={(event) => setAnchor(event.currentTarget)}>{content}</button>
      : content}
    {anchor ? <TrackerDateEditor anchor={anchor} job={job} onClose={() => setAnchor(null)} onUpdate={onUpdate} /> : null}
  </td>;
}

function TrackerDateEditor({ anchor, job, onClose, onUpdate }: {
  anchor: HTMLElement; job: JobRow; onClose: () => void; onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
}) {
  const [start, setStart] = useState(job.startDate?.slice(0, 10) ?? '');
  const [end, setEnd] = useState(job.dueDate?.slice(0, 10) ?? '');
  const [month, setMonth] = useState((job.startDate ?? new Date().toISOString()).slice(0, 7));
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const monthDate = calendarDate(`${month}-01`);
  const offset = (monthDate.getUTCDay() + 6) % 7;
  const count = rangeDayCount(start, end);
  const invalid = Boolean(start && end && end < start);
  const close = () => { if (!saving) onClose(); };
  const changeMonth = (direction: number) => setMonth(isoCalendarDate(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + direction, 1))).slice(0, 7));
  const chooseDay = (day: string) => {
    if (selecting === 'start' || !start) { setStart(day); setEnd(''); setSelecting('end'); }
    else if (day < start) { setEnd(start); setStart(day); setSelecting('start'); }
    else { setEnd(day); setSelecting('start'); }
  };
  const save = async () => {
    if (invalid) return;
    setSaving(true); setError('');
    try { await onUpdate(job, { startDate: start || null, dueDate: end || null }); onClose(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setSaving(false); }
  };
  return <TrackerPopover anchor={anchor} title="Establecer fechas" onClose={close}>
    <form className="jt-date-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="jt-date-fields">
        <label>Inicio<input type="date" aria-label="Fecha inicial" value={start} disabled={saving} onFocus={() => setSelecting('start')}
          onChange={(event) => { setStart(event.target.value); if (event.target.value) setMonth(event.target.value.slice(0, 7)); }} /></label>
        <label>Fin<input type="date" aria-label="Fecha final" value={end} disabled={saving} onFocus={() => setSelecting('end')} onChange={(event) => setEnd(event.target.value)} /></label>
      </div>
      <div className="jt-calendar-nav"><input type="month" value={month} aria-label="Mes del calendario" disabled={saving} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} />
        <button type="button" aria-label="Mes anterior" disabled={saving} onClick={() => changeMonth(-1)}>‹</button><button type="button" aria-label="Mes siguiente" disabled={saving} onClick={() => changeMonth(1)}>›</button></div>
      <div className="jt-calendar-grid" role="group" aria-label="Seleccionar rango de fechas">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((day) => <span key={day}>{day}</span>)}
        {Array.from({ length: 42 }, (_, index) => {
          const date = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), index - offset + 1));
          const day = isoCalendarDate(date);
          return <button key={day} type="button" disabled={saving} aria-label={day} aria-pressed={day === start || day === end}
            className={[day.slice(0, 7) !== month ? 'jt-outside-month' : '', start && end && day > start && day < end ? 'jt-range-middle' : '', day === start || day === end ? 'jt-range-edge' : ''].filter(Boolean).join(' ')} onClick={() => chooseDay(day)}>{date.getUTCDate()}</button>;
        })}
      </div>
      <p className="jt-calendar-hint" role="status">{count ? `${count} ${count === 1 ? 'día seleccionado' : 'días seleccionados'}` : selecting === 'end' ? 'Selecciona la fecha final' : 'Selecciona la fecha inicial'}</p>
      {invalid ? <p role="alert" className="jt-editor-error">La fecha final debe ser igual o posterior a la inicial.</p> : null}
      {error ? <p role="alert" className="jt-editor-error">{error}</p> : null}
      <div className="jt-editor-actions"><button type="button" disabled={saving} onClick={() => { setStart(''); setEnd(''); setSelecting('start'); }}>Quitar fechas</button>
        <button type="submit" disabled={saving || invalid}>{saving ? 'Guardando…' : 'Guardar fechas'}</button></div>
    </form>
  </TrackerPopover>;
}

export function TrackerSummaryCell({ jobs, labels, kind, propertyName }: { jobs: JobRow[]; labels: TrackerLabel[]; kind: TrackerLabel['kind']; propertyName: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const storageKey = `aar-tracker-summary-${kind}`;
  const [mode, setMode] = useState<TrackerSummaryMode>(() => {
    try { return localStorage.getItem(storageKey) === 'done' ? 'done' : 'all'; } catch { return 'all'; }
  });
  useEffect(() => {
    const sync = () => { try { setMode(localStorage.getItem(storageKey) === 'done' ? 'done' : 'all'); } catch { /* Optional preference. */ } };
    window.addEventListener('tracker-summary-change', sync);
    return () => window.removeEventListener('tracker-summary-change', sync);
  }, [storageKey]);
  const segments = trackerSummary(jobs, labels, kind, mode);
  const summary = segments.map((segment) => `${segment.count} ${segment.label}`).join(', ');
  const title = `Resumen de ${kind === 'status' ? 'estado' : 'prioridad'} de ${propertyName}`;
  return <td><button type="button" className="jt-summary-button" aria-label={title} title={summary} aria-haspopup="dialog" aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)}>
    <span className="jt-status-summary" role="img" aria-label={summary}>{segments.map((segment) => <span key={segment.value} style={{ flex: segment.count, background: segment.color }} />)}</span>
  </button>
    {anchor ? <TrackerPopover anchor={anchor} title={title} compact onClose={() => setAnchor(null)}>
      <div className="jt-summary-options">{(['all', 'done'] as const).map((value) => <label key={value}><input type="radio" name={title} value={value} checked={mode === value} onChange={() => {
        setMode(value);
        try { localStorage.setItem(storageKey, value); window.dispatchEvent(new Event('tracker-summary-change')); } catch { /* Optional preference. */ }
      }} />{value === 'all' ? 'All Labels' : "What's Done"}</label>)}</div>
    </TrackerPopover> : null}
  </td>;
}

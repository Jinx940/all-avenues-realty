import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { trackerSegmentText } from '../lib/jobTracker';

type SummarySegment = { value: string; label: string; count: number; color?: string; className?: string };

export function TrackerSummaryBar({ segments, total, onOpen, actionLabel, expanded = false }: {
  segments: SummarySegment[]; total: number;
  onOpen?: (anchor: HTMLElement) => void; actionLabel: string; expanded?: boolean;
}) {
  const [active, setActive] = useState<{ element: HTMLElement; value: string } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tooltipId = useId();
  const bar = useRef<HTMLButtonElement>(null);
  const summary = segments.map((segment) => `${segment.count} ${segment.label}`).join(', ');
  const activeSegment = active && segments.find((segment) => segment.value === active.value);
  const showTooltip = (hovered || focused) && activeSegment && !expanded;
  const dismiss = () => { setHovered(false); setFocused(false); setActive(null); };
  useEffect(() => {
    const hide = () => { setHovered(false); setFocused(false); setActive(null); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    const otherSummary = (event: Event) => { if ((event as CustomEvent<string>).detail !== tooltipId) hide(); };
    document.addEventListener('keydown', keyboard);
    window.addEventListener('tracker-summary-tooltip', otherSummary);
    return () => { document.removeEventListener('keydown', keyboard); window.removeEventListener('tracker-summary-tooltip', otherSummary); };
  }, [tooltipId]);
  return <><button ref={bar} type="button" className="jt-summary-button" aria-label={actionLabel} aria-describedby={showTooltip ? tooltipId : undefined}
      aria-haspopup={onOpen ? 'dialog' : undefined} aria-expanded={onOpen ? expanded : undefined}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => {
        window.dispatchEvent(new CustomEvent('tracker-summary-tooltip', { detail: tooltipId }));
        const element = bar.current?.querySelector<HTMLElement>('.jt-summary-segment');
        if (element && segments.length) setActive({ element, value: segments[0].value });
        setFocused(true);
      }} onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const index = segments.findIndex((segment) => segment.value === active?.value);
          const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + segments.length) % segments.length;
          const element = bar.current?.querySelectorAll<HTMLElement>('.jt-summary-segment')[next];
          if (element) { setActive({ element, value: segments[next].value }); setFocused(true); }
        }
      }} onClick={(event) => {
        if (onOpen) { dismiss(); onOpen(event.currentTarget); }
      }}>
      <span className="jt-status-summary" role="img" aria-label={summary}>
        {segments.map((segment) => <span key={segment.value} className={`jt-summary-segment ${segment.className ?? ''}`}
          style={{ flex: segment.count, ...(segment.color ? { background: segment.color } : {}) } as CSSProperties}
          onPointerEnter={(event) => {
            window.dispatchEvent(new CustomEvent('tracker-summary-tooltip', { detail: tooltipId }));
            setActive({ element: event.currentTarget, value: segment.value }); setHovered(true);
          }} />)}
      </span>
    </button>
    {showTooltip && active ? <SummaryTooltip id={tooltipId} anchor={active.element} text={trackerSegmentText(activeSegment.label, activeSegment.count, total)} /> : null}
  </>;
}

function SummaryTooltip({ id, anchor, text }: { id: string; anchor: HTMLElement; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(bounds.left + bounds.width / 2 - element.offsetWidth / 2, window.innerWidth - element.offsetWidth - 8));
      const above = bounds.top >= element.offsetHeight + 16;
      element.style.left = `${left}px`;
      element.style.top = `${above ? bounds.top - element.offsetHeight - 9 : bounds.bottom + 9}px`;
      element.style.setProperty('--jt-tooltip-arrow', `${Math.max(10, Math.min(bounds.left + bounds.width / 2 - left, element.offsetWidth - 10))}px`);
      element.dataset.side = above ? 'top' : 'bottom';
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); };
  }, [anchor, text]);
  return createPortal(<div id={id} ref={ref} className="jt-summary-tooltip" role="tooltip">{text}</div>, document.body);
}

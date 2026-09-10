import { useState, type CSSProperties } from 'react';
import { calendarDate, isoCalendarDate, rangeDayCount, trackerDueDateRange } from '../lib/jobTracker';
import type { JobRow } from '../types';

export function TrackerDateSummaryCell({ jobs, propertyName }: { jobs: JobRow[]; propertyName: string }) {
  const [showDays, setShowDays] = useState(false);
  const range = trackerDueDateRange(jobs);
  if (!range) return <td className="jt-date-summary-cell"><span className="jt-empty-value" aria-label="No due dates">—</span></td>;

  const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const full = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
  const start = calendarDate(range.start);
  const end = calendarDate(range.end);
  const dates = range.start === range.end ? short.format(start) : `${short.format(start)} – ${short.format(end)}`;
  const description = `${full.format(start)} – ${full.format(end)} · ${range.days} ${range.days === 1 ? 'day' : 'days'}`;
  const now = new Date();
  const today = isoCalendarDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const progress = Math.min(100, rangeDayCount(range.start, today) / range.days * 100);

  return <td className="jt-date-summary-cell">
    <button type="button" className="jt-date-summary" aria-label={`Due date summary for ${propertyName}: ${description}`}
      title={description} aria-pressed={showDays} onClick={() => setShowDays((current) => !current)}
      style={{ '--jt-date-progress': `${progress}%` } as CSSProperties}>
      <span className="jt-date-summary-dates" aria-hidden="true">{dates}</span>
      <span className="jt-date-summary-days" aria-hidden="true">{range.days}d</span>
    </button>
  </td>;
}

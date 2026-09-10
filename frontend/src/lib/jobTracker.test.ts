import { describe, expect, it } from 'vitest';
import { defaultTrackerLabels, labelTextColor, rangeDayCount, resolveTrackerLabels, trackerSummary, trackerSegmentText, resolveTrackerColumns } from './jobTracker';
import type { JobRow } from '../types';

describe('tracker summaries', () => {
  const jobs = [{ status: 'DONE', priority: 'HIGH' }, { status: 'IN_PROGRESS', priority: 'LOW' }, { status: 'DONE', priority: null }] as JobRow[];
  it('keeps unfinished work in the denominator of completion summaries', () => {
    const segments = trackerSummary(jobs, defaultTrackerLabels, 'priority', 'done');
    expect(segments.map(({ value, count }) => [value, count])).toEqual([['HIGH', 1], ['NONE', 1], ['REMAINING', 1]]);
    expect(trackerSummary(jobs, defaultTrackerLabels, 'status', 'done').map(({ value, count }) => [value, count])).toEqual([['DONE', 2], ['REMAINING', 1]]);
  });
  it('shows all priorities and preserves canonical keys after renaming labels', () => {
    const labels = resolveTrackerLabels([{ kind: 'status', value: 'DONE', label: 'Finished', color: '#ffffff' }]);
    expect(trackerSummary(jobs, labels, 'status', 'done')[0].label).toBe('Finished');
    expect(trackerSummary(jobs, labels, 'priority', 'all').some((segment) => segment.value === 'LOW')).toBe(true);
    expect(trackerSummary([], labels, 'status', 'done')).toEqual([]);
  });
  it('reports each segment using the full group denominator and one decimal place', () => {
    expect(trackerSegmentText('High', 1, 3)).toBe('High 1/3  33.3%');
    expect(trackerSegmentText('Done', 2, 3)).toBe('Done 2/3  66.7%');
    expect(trackerSegmentText('Empty', 0, 0)).toBe('Empty 0/0  0.0%');
    const segments = trackerSummary(jobs, defaultTrackerLabels, 'priority', 'done');
    expect(trackerSegmentText(segments[0].label, segments[0].count, jobs.length)).toBe('High 1/3  33.3%');
  });
});
it('renames headers without reordering or changing their data keys', () => {
  const columns = resolveTrackerColumns([{ key: 'description', label: 'Work notes' }]);
  expect(columns).toHaveLength(14);
  expect(columns[0]).toEqual({ key: 'service', label: 'Work' });
  expect(columns[4]).toEqual({ key: 'description', label: 'Work notes' });
});
it('counts calendar dates inclusively across months and daylight saving changes', () => {
  expect(rangeDayCount('2026-08-27', '2026-08-29')).toBe(3);
  expect(rangeDayCount('2026-03-07', '2026-03-09')).toBe(3);
  expect(rangeDayCount('2028-02-28', '2028-03-01')).toBe(3);
  expect(rangeDayCount('2026-09-10', '2026-09-09')).toBe(0);
});
it('chooses readable text for both light and dark custom label colors', () => {
  expect(labelTextColor('#ffffff')).toBe('#202338');
  expect(labelTextColor('#401694')).toBe('#ffffff');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { JobStatus } from '@prisma/client';
import { buildTrackerUpdate, trackerLabelsSchema } from '../src/lib/jobTracker.js';

const existing = { status: JobStatus.DONE, completedAt: new Date('2026-08-29T00:00:00Z'), startDate: new Date('2026-08-27T00:00:00Z'), dueDate: new Date('2026-08-31T00:00:00Z') };

test('reopening a completed job clears its completion timestamp', () => {
  assert.deepEqual(buildTrackerUpdate(existing, { status: 'STUCK' }), { status: 'STUCK', completedAt: null });
});
test('completion is timestamped once and preserved on repeated updates', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  assert.equal(buildTrackerUpdate({ ...existing, status: JobStatus.STUCK, completedAt: null }, { status: 'DONE' }, now).completedAt, now);
  assert.equal(buildTrackerUpdate(existing, { status: 'DONE' }, now).completedAt, existing.completedAt);
});
test('priority updates and clearing never overwrite status, dates or costs', () => {
  assert.deepEqual(buildTrackerUpdate(existing, { priority: 'HIGH' }), { priority: 'HIGH' });
  assert.deepEqual(buildTrackerUpdate(existing, { priority: null }), { priority: null });
  assert.throws(() => buildTrackerUpdate(existing, { materialCost: 1 }));
  assert.throws(() => buildTrackerUpdate(existing, { priority: 'URGENT' }));
  assert.throws(() => buildTrackerUpdate(existing, {}));
});
test('calendar accepts same day ranges, clears dates and preserves completion', () => {
  const updated = buildTrackerUpdate(existing, { startDate: '2026-09-10', dueDate: '2026-09-10' });
  assert.equal(updated.startDate?.getTime(), updated.dueDate?.getTime());
  assert.equal('completedAt' in updated, false);
  assert.deepEqual(buildTrackerUpdate(existing, { startDate: null, dueDate: null }), { startDate: null, dueDate: null });
});
test('calendar rejects invalid and reversed ranges, including partial date changes', () => {
  assert.throws(() => buildTrackerUpdate(existing, { startDate: '2026-09-20', dueDate: '2026-09-19' }));
  assert.throws(() => buildTrackerUpdate(existing, { startDate: '2026-09-20' }));
  assert.throws(() => buildTrackerUpdate(existing, { startDate: '2026-02-30' }));
  assert.throws(() => buildTrackerUpdate(existing, { startDate: 'invalid' }));
});
test('label editing validates canonical values, color, unique keys and nonempty names', () => {
  const label = { kind: 'status', value: 'DONE', label: 'Terminado', color: '#00aa77' };
  assert.equal(trackerLabelsSchema.parse([label])[0].label, 'Terminado');
  assert.throws(() => trackerLabelsSchema.parse([{ ...label, value: 'ARBITRARY' }]));
  assert.throws(() => trackerLabelsSchema.parse([{ ...label, color: 'url(unsafe)' }]));
  assert.throws(() => trackerLabelsSchema.parse([{ ...label, label: '   ' }]));
  assert.throws(() => trackerLabelsSchema.parse([label, label]));
  assert.throws(() => trackerLabelsSchema.parse([{ ...label, kind: 'priority' }]));
});

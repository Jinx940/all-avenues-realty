import assert from 'node:assert/strict';
import test from 'node:test';
import { JobStatus } from '@prisma/client';
import { buildTrackerUpdate, trackerLabelsSchema, trackerColumnKeySchema, trackerColumnUpdateSchema } from '../src/lib/jobTracker.js';

const existing = { status: JobStatus.DONE, completedAt: new Date('2026-08-29T00:00:00Z'), startDate: new Date('2026-08-27T00:00:00Z'), dueDate: new Date('2026-08-31T00:00:00Z') };

test('column renaming accepts every board header but rejects unknown fields and empty names', () => {
  for (const key of ['service', 'workers', 'status', 'dueDate', 'description', 'priority', 'paymentStatus', 'laborCost', 'materialCost', 'before', 'after', 'timeline', 'updatedAt', 'actions']) {
    assert.equal(trackerColumnKeySchema.parse(key), key);
  }
  assert.deepEqual(trackerColumnUpdateSchema.parse({ label: '  Work notes  ' }), { label: 'Work notes' });
  for (const label of ['', '   ', 'a'.repeat(41), null]) assert.throws(() => trackerColumnUpdateSchema.parse({ label }));
  assert.throws(() => trackerColumnKeySchema.parse('totalCost'));
  assert.throws(() => trackerColumnUpdateSchema.parse({ label: 'Work notes', key: 'service' }));
});

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
  assert.throws(() => buildTrackerUpdate(existing, { service: 'Renamed task' }));
  assert.throws(() => buildTrackerUpdate(existing, { priority: 'URGENT' }));
  assert.throws(() => buildTrackerUpdate(existing, {}));
});

test('editing business cells changes only provided fields and supports clearing', () => {
  assert.deepEqual(buildTrackerUpdate(existing, { description: '' }), { description: '' });
  assert.deepEqual(buildTrackerUpdate(existing, { laborCost: 1234.56 }), { laborCost: 1234.56 });
  assert.deepEqual(buildTrackerUpdate(existing, { materialCost: 0 }), { materialCost: 0 });
  assert.deepEqual(buildTrackerUpdate(existing, { workerIds: [] }), { workerIds: [] });
  assert.deepEqual(buildTrackerUpdate(existing, { workerIds: ['a', 'a', 'b'] }), { workerIds: ['a', 'b'] });
  assert.deepEqual(buildTrackerUpdate(existing, { paymentStatus: 'UNPAID' }), { paymentStatus: 'UNPAID' });
  assert.deepEqual(buildTrackerUpdate(existing, { paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: 10.25 }), { paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: 10.25 });
});

test('business cells reject invalid money, notes, workers and audit timestamps', () => {
  for (const amount of [-1, NaN, Infinity, 0.001, 1e10, '1,000.00', null]) {
    assert.throws(() => buildTrackerUpdate(existing, { laborCost: amount }));
    assert.throws(() => buildTrackerUpdate(existing, { materialCost: amount }));
    assert.throws(() => buildTrackerUpdate(existing, { advanceCashApp: amount }));
  }
  for (const amount of [0, 0.01, 93.83, 1234.56, 9999999999.99]) assert.equal(buildTrackerUpdate(existing, { laborCost: amount }).laborCost, amount);
  assert.throws(() => buildTrackerUpdate(existing, { description: 'a'.repeat(3001) }));
  assert.throws(() => buildTrackerUpdate(existing, { workerIds: [''] }));
  assert.throws(() => buildTrackerUpdate(existing, { workerIds: 'a' }));
  assert.throws(() => buildTrackerUpdate(existing, { paymentStatus: 'INVALID' }));
  assert.throws(() => buildTrackerUpdate(existing, { updatedAt: '2020-01-01' }));
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

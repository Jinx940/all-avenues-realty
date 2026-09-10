import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTrackerSubitem, descriptionParagraphs, trackerSubitemSchema } from '../src/lib/trackerSubitems.js';
import { buildTrackerUpdate } from '../src/lib/jobTracker.js';
import { JobStatus } from '@prisma/client';

test('converts each nonempty paragraph once without splitting sentences or losing order', () => {
  assert.deepEqual(descriptionParagraphs(' First sentence. Second sentence.\r\n\r\nNext task\n \nFinal task '), ['First sentence. Second sentence.', 'Next task', 'Final task']);
  assert.deepEqual(descriptionParagraphs(' \n '), []);
});

test('subitem validation rejects empty descriptions, unknown actions and mixed parent changes', () => {
  for (const change of [
    { action: 'create', description: ' ' }, { action: 'update', id: 'a' },
    { action: 'update', id: 'a', status: 'OTHER' }, { action: 'delete', id: 'a', jobId: 'another-job' },
  ]) assert.throws(() => trackerSubitemSchema.parse(change));
  assert.throws(() => buildTrackerUpdate({ status: JobStatus.DONE, dueDate: null, startDate: null, completedAt: null }, {
    status: 'PENDING', subitem: { action: 'delete', id: 'a' },
  }));
});

test('subitem changes cannot update or delete an item from another job', async () => {
  let mutations = 0;
  const tx = { jobSubitem: {
    findFirst: async ({ where }: { where: { id: string; jobId: string } }) => { assert.deepEqual(where, { id: 'foreign', jobId: 'current' }); return null; },
    update: async () => { mutations++; }, delete: async () => { mutations++; },
  } };
  for (const change of [{ action: 'update' as const, id: 'foreign', description: 'Changed' }, { action: 'delete' as const, id: 'foreign' }]) {
    await assert.rejects(() => applyTrackerSubitem(tx as never, 'current', change), /Subitem not found/);
  }
  assert.equal(mutations, 0);
});

test('editing a subitem only changes supplied fields and can clear owners and dates', async () => {
  const updates: unknown[] = [];
  const tx = { jobSubitem: { findFirst: async () => ({ id: 'item' }), update: async (args: unknown) => { updates.push(args); } } };
  await applyTrackerSubitem(tx as never, 'job', { action: 'update', id: 'item', status: 'DONE' });
  await applyTrackerSubitem(tx as never, 'job', { action: 'update', id: 'item', dueDate: null, workerIds: [] });
  assert.deepEqual(updates, [
    { where: { id: 'item' }, data: { status: 'DONE' } },
    { where: { id: 'item' }, data: { dueDate: null, assignments: { deleteMany: {}, create: [] } } },
  ]);
  await assert.rejects(() => applyTrackerSubitem(tx as never, 'job', { action: 'update', id: 'item', dueDate: '2026-02-30' }), /real calendar date/);
});

test('new subitems append after existing items and validate owners before writing', async () => {
  const created: unknown[] = [];
  const tx = {
    worker: { findMany: async () => [{ id: 'worker' }] },
    jobSubitem: { aggregate: async () => ({ _max: { sortOrder: 4 } }), create: async (args: unknown) => { created.push(args); } },
  };
  await applyTrackerSubitem(tx as never, 'job', { action: 'create', description: ' New task ', workerIds: ['worker', 'worker'] });
  assert.deepEqual(created, [{ data: { description: 'New task', jobId: 'job', sortOrder: 5, assignments: { create: [{ workerId: 'worker' }] } } }]);
  await assert.rejects(() => applyTrackerSubitem(tx as never, 'job', { action: 'create', description: 'Another', workerIds: ['worker', 'missing'] }), /no longer exist/);
  assert.equal(created.length, 1);
});

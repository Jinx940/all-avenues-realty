import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { jobArchiveSchema, updateJobArchive } from '../src/lib/jobArchive.js';

test('archive accepts only an explicit, nonempty, unique job selection', () => {
  for (const input of [{ archived: true, jobIds: [] }, { archived: true, jobIds: ['a', 'a'] },
    { archived: 'true', jobIds: ['a'] }, { archived: true, jobIds: ['a'], status: 'DONE' }]) {
    assert.equal(jobArchiveSchema.safeParse(input).success, false);
  }
});

test('archive and restore constrain updates to the property, selected IDs and prior state', async () => {
  const calls: Prisma.JobUpdateManyArgs[] = [];
  const tx = { job: { updateMany: async (args: Prisma.JobUpdateManyArgs) => { calls.push(args); return { count: 2 }; } } } as unknown as Prisma.TransactionClient;
  await updateJobArchive(tx, 'property-a', { archived: true, jobIds: ['one', 'two'] });
  assert.deepEqual(calls[0].where, { propertyId: 'property-a', id: { in: ['one', 'two'] }, archivedAt: null });
  assert.deepEqual(Object.keys(calls[0].data), ['archivedAt']);
  assert.ok(calls[0].data.archivedAt instanceof Date);
  await updateJobArchive(tx, 'property-a', { archived: false, jobIds: ['one', 'two'] });
  assert.deepEqual(calls[1].where, { propertyId: 'property-a', id: { in: ['one', 'two'] }, archivedAt: { not: null } });
  assert.deepEqual(calls[1].data, { archivedAt: null });
});

test('a partial match throws so the enclosing transaction cannot commit partial archives', async () => {
  const tx = { job: { updateMany: async () => ({ count: 1 }) } } as unknown as Prisma.TransactionClient;
  await assert.rejects(updateJobArchive(tx, 'a', { archived: true, jobIds: ['one', 'foreign-or-stale'] }), /Refresh Job Tracker/);
});

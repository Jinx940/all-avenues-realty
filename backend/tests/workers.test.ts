import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../src/lib/http.js';
import { ensureWorkerIdsExist, normalizeWorkerIds } from '../src/lib/workers.js';

test('normalizeWorkerIds removes blanks and duplicate ids while preserving order', () => {
  assert.deepEqual(
    normalizeWorkerIds([' worker-1 ', '', 'worker-2', 'worker-1', 'worker-2']),
    ['worker-1', 'worker-2'],
  );
});

test('ensureWorkerIdsExist rejects ids that are no longer present', async () => {
  await assert.rejects(
    () =>
      ensureWorkerIdsExist(['worker-1', 'worker-2'], {
        worker: {
          findMany: async () => [{ id: 'worker-1' }],
        },
      } as never),
    (error) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message === 'One or more selected workers no longer exist. Refresh the page and try again.',
  );
});

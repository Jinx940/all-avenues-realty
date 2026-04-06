import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRole, UserStatus } from '@prisma/client';
import { HttpError } from '../src/lib/http.js';
import { ensureActiveAdminGuard, ensureWorkerRoleLink } from '../src/lib/users.js';

test('ensureWorkerRoleLink requires a linked worker for worker users', async () => {
  await assert.rejects(
    () =>
      ensureWorkerRoleLink(UserRole.WORKER, null, {
        client: {
          worker: {
            findUnique: async () => null,
          },
        } as never,
      }),
    (error) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message === 'Worker users must be linked to a worker profile.',
  );
});

test('ensureWorkerRoleLink rejects workers already linked to another user', async () => {
  await assert.rejects(
    () =>
      ensureWorkerRoleLink(UserRole.WORKER, 'worker-1', {
        currentUserId: 'user-1',
        client: {
          worker: {
            findUnique: async () => ({
              id: 'worker-1',
              name: 'Crew One',
              user: {
                id: 'user-2',
              },
            }),
          },
        } as never,
      }),
    (error) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message === 'Worker "Crew One" is already linked to another user.',
  );
});

test('ensureWorkerRoleLink allows updating the same linked worker', async () => {
  const worker = await ensureWorkerRoleLink(UserRole.WORKER, 'worker-1', {
    currentUserId: 'user-1',
    client: {
      worker: {
        findUnique: async () => ({
          id: 'worker-1',
          name: 'Crew One',
          user: {
            id: 'user-1',
          },
        }),
      },
    } as never,
  });

  assert.equal(worker?.id, 'worker-1');
});

test('ensureActiveAdminGuard rejects removing the last active admin', async () => {
  await assert.rejects(
    () =>
      ensureActiveAdminGuard(
        {
          currentUserId: 'admin-1',
          existingRole: UserRole.ADMIN,
          existingStatus: UserStatus.ACTIVE,
          nextRole: UserRole.VIEWER,
          nextStatus: UserStatus.INACTIVE,
        },
        {
          user: {
            count: async () => 0,
          },
        } as never,
      ),
    (error) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message === 'At least one active admin account must remain available.',
  );
});

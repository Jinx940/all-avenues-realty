import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRole, UserStatus } from '@prisma/client';
import { canCreateJobs, canManageJobs, roleScopeForDocuments } from '../src/lib/access.js';

test('job creation permissions allow linked field workers without granting manager permissions', () => {
  assert.equal(canCreateJobs(UserRole.ADMIN), true);
  assert.equal(canCreateJobs(UserRole.OFFICE), true);
  assert.equal(canCreateJobs(UserRole.WORKER), true);
  assert.equal(canCreateJobs(UserRole.VIEWER), false);

  assert.equal(canManageJobs(UserRole.WORKER), false);
});

test('worker document scope requires every linked job to be assigned to the worker', () => {
  assert.deepEqual(
    roleScopeForDocuments({
      id: 'user-1',
      username: 'field',
      displayName: 'Field Worker',
      role: UserRole.WORKER,
      status: UserStatus.ACTIVE,
      workerId: 'worker-1',
    }),
    {
      files: {
        some: {
          job: {
            assignments: {
              some: {
                workerId: 'worker-1',
              },
            },
          },
        },
        every: {
          job: {
            assignments: {
              some: {
                workerId: 'worker-1',
              },
            },
          },
        },
      },
    },
  );
});

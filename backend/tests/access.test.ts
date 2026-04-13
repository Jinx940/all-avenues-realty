import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRole } from '@prisma/client';
import { canCreateJobs, canManageJobs } from '../src/lib/access.js';

test('job creation permissions allow linked field workers without granting manager permissions', () => {
  assert.equal(canCreateJobs(UserRole.ADMIN), true);
  assert.equal(canCreateJobs(UserRole.OFFICE), true);
  assert.equal(canCreateJobs(UserRole.WORKER), true);
  assert.equal(canCreateJobs(UserRole.VIEWER), false);

  assert.equal(canManageJobs(UserRole.WORKER), false);
});

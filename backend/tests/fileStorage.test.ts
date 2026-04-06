import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  createSupabaseStorageRef,
  isSupabaseStorageRef,
  localStoredFileSearchPaths,
  localUploadsSearchDirs,
  managedStoredRefFromValue,
  storagePathFromRef,
} from '../src/lib/fileStorage.js';

test('Supabase storage refs round-trip cleanly', () => {
  const ref = createSupabaseStorageRef('jobs/job-1/receipt/file.pdf');

  assert.equal(isSupabaseStorageRef(ref), true);
  assert.equal(storagePathFromRef(ref), 'jobs/job-1/receipt/file.pdf');
});

test('managedStoredRefFromValue supports Supabase refs and legacy uploads urls', () => {
  assert.equal(
    managedStoredRefFromValue('supabase:properties/property-1/cover-image/photo.webp'),
    'supabase:properties/property-1/cover-image/photo.webp',
  );
  assert.equal(
    managedStoredRefFromValue('/uploads/legacy-photo.png'),
    'legacy-photo.png',
  );
  assert.equal(
    managedStoredRefFromValue('legacy-photo.png'),
    'legacy-photo.png',
  );
  assert.equal(managedStoredRefFromValue('https://example.com/photo.png'), null);
  assert.equal(managedStoredRefFromValue(''), null);
});

test('localUploadsSearchDirs includes current and legacy upload directories without duplicates', () => {
  const cwd = path.resolve('workspace/project');
  const uploadsDir = path.resolve('persistent/uploads');

  assert.deepEqual(localUploadsSearchDirs(cwd, uploadsDir), [
    uploadsDir,
    path.resolve(cwd, 'uploads'),
    path.resolve(cwd, 'backend', 'uploads'),
    path.resolve(cwd, '..', 'uploads'),
  ]);
});

test('localStoredFileSearchPaths builds candidate paths for legacy local uploads', () => {
  const cwd = path.resolve('workspace/project');
  const uploadsDir = path.resolve('persistent/uploads');

  assert.deepEqual(localStoredFileSearchPaths('legacy-photo.png', cwd, uploadsDir), [
    path.resolve(uploadsDir, 'legacy-photo.png'),
    path.resolve(cwd, 'uploads', 'legacy-photo.png'),
    path.resolve(cwd, 'backend', 'uploads', 'legacy-photo.png'),
    path.resolve(cwd, '..', 'uploads', 'legacy-photo.png'),
  ]);
});

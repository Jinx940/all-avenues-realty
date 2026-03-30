import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSupabaseStorageRef,
  isSupabaseStorageRef,
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
  assert.equal(managedStoredRefFromValue('https://example.com/photo.png'), null);
  assert.equal(managedStoredRefFromValue(''), null);
});

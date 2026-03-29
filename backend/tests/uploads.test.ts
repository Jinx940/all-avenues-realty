import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedUploadFile } from '../src/lib/uploads.js';

test('isAllowedUploadFile accepts valid image uploads for photo fields', () => {
  assert.equal(isAllowedUploadFile('before', 'image/png', 'before-photo.png'), true);
  assert.equal(isAllowedUploadFile('coverImage', 'image/jpeg', 'cover.jpg'), true);
});

test('isAllowedUploadFile rejects mismatched extensions and mime types', () => {
  assert.equal(isAllowedUploadFile('before', 'image/png', 'script.pdf'), false);
  assert.equal(isAllowedUploadFile('receipt', 'image/png', 'receipt.pdf'), false);
});

test('isAllowedUploadFile accepts pdf only for document fields', () => {
  assert.equal(isAllowedUploadFile('receipt', 'application/pdf', 'receipt.pdf'), true);
  assert.equal(isAllowedUploadFile('after', 'application/pdf', 'after.pdf'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDocumentNumberFromValues } from '../src/lib/documentNumbers.js';

test('nextDocumentNumberFromValues starts at 1001 and ignores non-numeric entries', () => {
  assert.equal(nextDocumentNumberFromValues([]), '1001');
  assert.equal(
    nextDocumentNumberFromValues(['0999', 'INV-20', ' 1044 ', 'quote']),
    '1045',
  );
});

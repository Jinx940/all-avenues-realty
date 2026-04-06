import assert from 'node:assert/strict';
import test from 'node:test';
import { GeneratedDocumentType } from '@prisma/client';
import {
  nextDocumentNumberFromDatabase,
  nextDocumentNumberFromValues,
} from '../src/lib/documentNumbers.js';

test('nextDocumentNumberFromValues starts at 1001 and ignores non-numeric entries', () => {
  assert.equal(nextDocumentNumberFromValues([]), '1001');
  assert.equal(
    nextDocumentNumberFromValues(['0999', 'INV-20', ' 1044 ', 'quote']),
    '1045',
  );
});

test('nextDocumentNumberFromDatabase reads the next numeric value from sql results', async () => {
  const client = {
    async $queryRaw() {
      return [{ nextNumber: 1068 }];
    },
  };

  assert.equal(
    await nextDocumentNumberFromDatabase(client, GeneratedDocumentType.INVOICE),
    '1068',
  );
});

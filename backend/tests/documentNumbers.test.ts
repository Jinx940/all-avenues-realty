import assert from 'node:assert/strict';
import test from 'node:test';
import { GeneratedDocumentType } from '@prisma/client';
import {
  nextDocumentNumberFromDatabase,
  nextDocumentNumberFromValues,
} from '../src/lib/documentNumbers.js';

test('nextDocumentNumberFromValues starts at 4001 and ignores non-numeric entries', () => {
  assert.equal(nextDocumentNumberFromValues([]), '4001');
  assert.equal(
    nextDocumentNumberFromValues(['0999', 'INV-20', ' 1044 ', 'quote']),
    '4001',
  );
  assert.equal(
    nextDocumentNumberFromValues(['3999', 'INV-20', ' 4004 ', 'quote']),
    '4005',
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
    '4001',
  );
});

test('nextDocumentNumberFromDatabase continues values above the starting floor', async () => {
  const client = {
    async $queryRaw() {
      return [{ nextNumber: 4068 }];
    },
  };

  assert.equal(
    await nextDocumentNumberFromDatabase(client, GeneratedDocumentType.INVOICE),
    '4068',
  );
});

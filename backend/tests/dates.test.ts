import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNullableLocalDate } from '../src/lib/dates.js';
import { HttpError } from '../src/lib/http.js';

test('parseNullableLocalDate returns null for blank values', () => {
  assert.equal(parseNullableLocalDate(''), null);
  assert.equal(parseNullableLocalDate(undefined), null);
});

test('parseNullableLocalDate parses strict local YYYY-MM-DD dates', () => {
  const date = parseNullableLocalDate('2026-05-18', 'dueDate');

  assert.equal(date?.getFullYear(), 2026);
  assert.equal(date?.getMonth(), 4);
  assert.equal(date?.getDate(), 18);
});

test('parseNullableLocalDate rejects malformed and impossible dates as bad requests', () => {
  assert.throws(
    () => parseNullableLocalDate('2026-02-31', 'dueDate'),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.throws(
    () => parseNullableLocalDate('not-a-date', 'dueDate'),
    (error) => error instanceof HttpError && error.status === 400,
  );
});

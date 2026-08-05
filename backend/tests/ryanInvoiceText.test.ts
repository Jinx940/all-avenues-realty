import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackRyanSummary, isLikelySpanish, summarizeRyanWork } from '../src/lib/ryanInvoiceText.js';

test('detects Spanish work descriptions', () => {
  assert.equal(isLikelySpanish('Se retiraron los paneles dañados y se limpió el área.'), true);
  assert.equal(isLikelySpanish('Removed damaged panels and cleaned the work area.'), false);
});

test('prefers existing English sentences in bilingual descriptions', () => {
  const summary = summarizeRyanWork(
    'Se retiraron los paneles dañados. Se limpió el área. Removed damaged panels. Cleaned the work area.',
  );
  assert.equal(summary, 'Removed damaged panels. Cleaned the work area.');
});

test('limits summaries to two action sentences', () => {
  const summary = summarizeRyanWork('Inspected the area. Removed debris. Installed new panels. Cleaned everything.');
  assert.equal(summary, 'Removed debris. Installed new panels.');
});

test('builds an English fallback from service and area', () => {
  assert.equal(fallbackRyanSummary('Soffit Repair', 'Front Porch'), 'Completed soffit repair work in Front Porch.');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinanceWorkbookBuffer, normalizeFinanceWorkbookFileName } from '../src/lib/financeWorkbook.js';

test('normalizeFinanceWorkbookFileName keeps xlsx extension and strips invalid characters', () => {
  assert.equal(normalizeFinanceWorkbookFileName('finance:summary'), 'finance-summary.xlsx');
  assert.equal(normalizeFinanceWorkbookFileName('report.xlsx'), 'report.xlsx');
});

test('buildFinanceWorkbookBuffer returns a non-empty xlsx buffer', async () => {
  const buffer = await buildFinanceWorkbookBuffer({
    fileName: 'finance-summary.xlsx',
    title: 'Finance Summary',
    meta: [
      { label: 'Report', value: 'Smoke test' },
      { label: 'Health score', value: 82, format: 'percent' },
    ],
    sections: [
      {
        title: 'Overview',
        rows: [
          { metric: 'Total jobs', value: 12, format: 'integer' },
          { metric: 'Collected revenue', value: 3200.5, format: 'currency' },
        ],
      },
    ],
  });

  assert.equal(buffer.subarray(0, 2).toString('utf8'), 'PK');
  assert.ok(buffer.length > 1000);
});

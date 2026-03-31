import { describe, expect, it } from 'vitest';
import { buildCsv, buildExcelCsv } from './csv';

describe('buildCsv', () => {
  it('escapes commas, quotes and null values safely', () => {
    expect(
      buildCsv([
        ['Name', 'Notes', 'Count'],
        ['All Avenues', 'Said "hello", then left', 2],
        ['Empty', null, 0],
      ]),
    ).toBe(
      'Name,Notes,Count\r\nAll Avenues,"Said ""hello"", then left",2\r\nEmpty,,0',
    );
  });

  it('wraps multiline values in quotes', () => {
    expect(buildCsv([['line 1\nline 2']])).toBe('"line 1\nline 2"');
  });

  it('rounds numeric values to keep exports readable', () => {
    expect(buildCsv([['Metric', 'Value'], ['Outstanding revenue', 743.8299999999999]])).toBe(
      'Metric,Value\r\nOutstanding revenue,743.83',
    );
  });
});

describe('buildExcelCsv', () => {
  it('adds an Excel separator hint so columns open correctly in Windows locales', () => {
    expect(buildExcelCsv([['Metric', 'Value'], ['Total jobs', 2]])).toBe(
      'sep=,\r\nMetric,Value\r\nTotal jobs,2',
    );
  });
});

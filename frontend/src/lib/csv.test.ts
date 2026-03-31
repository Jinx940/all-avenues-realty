import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';

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
});

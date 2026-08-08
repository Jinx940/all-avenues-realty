import { describe, expect, it } from 'vitest';
import { azeDocumentBrandLinesFor, generatedDocumentTemplateFor } from './generatedDocumentTemplate';

describe('generated document template selection', () => {
  it('uses the Juan AZE design for both invoices and quotes', () => {
    expect(generatedDocumentTemplateFor('aze', 'Invoice')).toBe('aze-modern');
    expect(generatedDocumentTemplateFor('aze', 'Quote')).toBe('aze-modern');
  });

  it('keeps the existing owner-specific templates unchanged', () => {
    expect(generatedDocumentTemplateFor('ryan', 'Invoice')).toBe('ryan-invoice');
    expect(generatedDocumentTemplateFor('todd', 'Quote')).toBe('todd-modern');
    expect(generatedDocumentTemplateFor('morales', 'Invoice')).toBe('morales-invoice');
    expect(generatedDocumentTemplateFor('ryan', 'Quote')).toBe('legacy-quote');
    expect(generatedDocumentTemplateFor('morales', 'Quote')).toBe('legacy-quote');
  });

  it('keeps the E beside the T in the Juan quote heading', () => {
    expect(azeDocumentBrandLinesFor('Quote')).toEqual(['QU', 'OTE']);
    expect(azeDocumentBrandLinesFor('Invoice')).toEqual(['IN', 'VOI', 'CE']);
  });
});

import { describe, expect, it } from 'vitest';
import { generatedDocumentTemplateFor } from './generatedDocumentTemplate';

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
});

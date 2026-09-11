import { describe, expect, it } from 'vitest';
import { buildCrystalInvoiceHtml, crystalDescriptionChunks, crystalDescriptionSentences, type CrystalInvoiceData } from './crystalInvoice';

const data: CrystalInvoiceData = {
  documentType: 'Invoice', invoiceNumber: '4010', docDate: '2026-09-10', billTo: 'Sample client',
  propertyName: 'Glynn', propertyAddress: '4256 E 119th St', propertyCityLine: 'Cleveland, OH',
  selectedItems: [{ unit: 'Unit 1', area: 'Kitchen', service: 'Plumbing', description: 'Replace supply lines.', labor: 2000, unitPrice: 350 }],
  jobTotal: 2350, materialExpense: 50, advancePayment: 100, totalDue: 2200, attachments: [],
};

describe('Crystal invoice', () => {
  it('removes the leading duplicate service and separates sentences without splitting decimals', () => {
    expect(crystalDescriptionSentences('Water leak. Found a leak. Replaced the 1.5 inch pipe. Cleaned up.', 'Water Leak')).toEqual(['Found a leak.', 'Replaced the 1.5 inch pipe.', 'Cleaned up.']);
    expect(crystalDescriptionSentences('Water leak repaired. Tested it.', 'Water Leak')).toEqual(['Water leak repaired.', 'Tested it.']);
    expect(crystalDescriptionSentences('Water Leak\nCleaned up.\n\nTested it.', 'Water Leak')).toEqual(['Cleaned up.', 'Tested it.']);
    const html = buildCrystalInvoiceHtml({ ...data, selectedItems: [{ ...data.selectedItems[0], service: 'Water Leak', description: 'Water leak. Cleaned up. Tested it.' }] });
    expect(html).toContain('<strong>Water Leak</strong><p class="cs-description">Cleaned up.</p><p class="cs-description">Tested it.</p>');
    expect(html).not.toContain('>Water leak.<');
  });
  it('groups interleaved bedrooms under their unit and joins description lines without blanks', () => {
    const selectedItems = ['Bedroom 2', 'Bedroom 1', 'Bedroom 2', 'Bedroom 1'].map((area, i) => ({
      ...data.selectedItems[0], area, service: i < 2 ? 'Electrical' : 'Cleaning', description: `Repair ${i}.\n\nChecked ${i}.`,
    }));
    const html = buildCrystalInvoiceHtml({ ...data, selectedItems });
    expect(html.match(/>Bedroom 2<\/td>/g)).toHaveLength(1);
    expect(html.match(/>Bedroom 1<\/td>/g)).toHaveLength(1);
    expect(html.indexOf('Repair 2.')).toBeLessThan(html.indexOf('Repair 1.'));
    expect(html).toContain('Repair 0.</p><p class="cs-description">Checked 0.');
    expect(html.match(/\$2,000.00/g)).toHaveLength(4);
    expect(selectedItems[1].area).toBe('Bedroom 1');
  });
  it('merges consecutive location and service cells without merging different areas or losing descriptions', () => {
    const html = buildCrystalInvoiceHtml({ ...data, selectedItems: [
      { ...data.selectedItems[0], description: 'First repair.' },
      { ...data.selectedItems[0], description: 'Second repair.' },
      { ...data.selectedItems[0], area: 'Bathroom', description: 'Third repair.' },
    ] });
    expect(html.match(/>Unit 1<\/td>/g)).toHaveLength(1);
    expect(html).toContain('class="cs-merged cs-level-0" rowspan="3"');
    expect(html).toContain('class="cs-merged cs-level-1" rowspan="2">Kitchen');
    expect(html.match(/<strong>Plumbing<\/strong>/g)).toHaveLength(2);
    for (const text of ['First repair.', 'Second repair.', 'Third repair.']) expect(html).toContain(text);
    expect(html.match(/\$2,000.00/g)).toHaveLength(3);
  });
  it('preserves paragraph order and every word while bounding continuation rows', () => {
    const text = Array.from({ length: 500 }, (_, index) => `Inspection${index}`).join(' ');
    const chunks = crystalDescriptionChunks(text);
    expect(chunks.every((chunk) => chunk.length <= 240)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
    expect(crystalDescriptionChunks('First paragraph.\n\nSecond paragraph.')).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('escapes customer content and uses only actual deductions, never sample tax or account details', () => {
    const html = buildCrystalInvoiceHtml({ ...data, billTo: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Crystal Sarich');
    expect(html).toContain('$2,200.00');
    expect(html).toContain('-$100.00');
    expect(html).not.toContain('10%');
    expect(html).not.toContain('123-456');
    expect(html).not.toContain('Authorized Officer');
  });

  it('paginates long descriptions without repeating billed amounts or totals', () => {
    const html = buildCrystalInvoiceHtml({ ...data, selectedItems: [{ ...data.selectedItems[0], description: 'Inspect every connection before completing the repair. '.repeat(90) }] });
    expect(html.match(/class="page crystal-invoice-page"/g)!.length).toBeGreaterThan(1);
    expect(html.match(/\$2,000.00/g)).toHaveLength(1);
    expect(html.match(/class="cs-total"/g)).toHaveLength(1);
    expect(html.match(/<thead>/g)).toHaveLength(1);
    expect(html).not.toContain('<footer');
  });
});

import { describe, expect, it } from 'vitest';
import { fitReceiptImageDimensions, generatedPdfPageRasterSettings } from './generatedPdf';

describe('generated PDF image sizing', () => {
  it('keeps Juan text-only pages lossless', () => {
    expect(generatedPdfPageRasterSettings(true, false)).toMatchObject({
      scale: 4,
      imageFormat: 'PNG',
    });
  });

  it('compresses pages containing attachment photos', () => {
    expect(generatedPdfPageRasterSettings(true, true)).toEqual({
      scale: 2,
      imageFormat: 'JPEG',
      mimeType: 'image/jpeg',
      quality: 0.86,
    });
  });

  it('limits oversized receipt images while preserving their ratio', () => {
    expect(fitReceiptImageDimensions(4000, 6000)).toEqual({ width: 1733, height: 2600 });
    expect(fitReceiptImageDimensions(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });
});

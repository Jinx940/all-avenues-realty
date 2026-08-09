import { describe, expect, it } from 'vitest';
import {
  fitReceiptImageDimensions,
  generatedPdfPageRasterSettings,
  receiptImagePlacementsForPage,
} from './generatedPdf';

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

  it('fits two receipt images side by side on one A4 page', () => {
    const placements = receiptImagePlacementsForPage([
      { width: 1000, height: 1500 },
      { width: 800, height: 1200 },
    ]);

    expect(placements).toHaveLength(2);
    expect(placements[0]?.width).toBeCloseTo(252.64, 2);
    expect(placements[0]?.height).toBeCloseTo(378.96, 2);
    expect(placements[0]?.x).toBeCloseTo(36, 2);
    expect(placements[1]?.x).toBeCloseTo(306.64, 2);
    expect((placements[0]?.x ?? 0) + (placements[0]?.width ?? 0)).toBeLessThan(
      placements[1]?.x ?? 0,
    );
  });

  it('keeps a single receipt compact and centered in the page', () => {
    const [placement] = receiptImagePlacementsForPage([{ width: 1000, height: 1500 }]);

    expect(placement?.width).toBeCloseTo(252.64, 2);
    expect(placement?.x).toBeCloseTo((595.28 - 252.64) / 2, 2);
  });
});

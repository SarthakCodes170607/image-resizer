import { describe, expect, it, vi } from 'vitest';
import {
  buildPdfAtQuality,
  compressPdfToTargetSize,
  getBase64SizeKB,
  optimizeToTargetSize,
} from './compressor';

// pdf-lib is replaced with a small fake so these tests do not need real JPEG data.
// The fake records how it was used, which lets us check one page is made per canvas.
const pdfSpies = vi.hoisted(() => ({
  embedJpg: vi.fn(async () => ({})),
  addPage: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(async () => new Uint8Array(2048)),
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: async () => ({
      embedJpg: pdfSpies.embedJpg,
      addPage: (size) => {
        pdfSpies.addPage(size);
        return { drawImage: pdfSpies.drawImage };
      },
      save: pdfSpies.save,
    }),
  },
}));

// A pretend canvas. `sizeKBAtQuality` decides how big the encoded image is for a
// given quality, so each test can describe exactly how the "encoder" behaves.
function makeFakeCanvas(sizeKBAtQuality, width = 100, height = 50) {
  return {
    width,
    height,
    toDataURL: vi.fn((format, quality) => {
      const sizeKB = sizeKBAtQuality(quality);
      const rawLength = Math.round((sizeKB * 1024 * 4) / 3);
      const base64Length = Math.ceil(rawLength / 4) * 4;
      return `data:${format};base64,${'A'.repeat(base64Length)}`;
    }),
  };
}

describe('getBase64SizeKB', () => {
  it('converts base64 length into kilobytes', () => {
    // 4 base64 characters hold 3 bytes.
    expect(getBase64SizeKB('data:image/jpeg;base64,AAAA')).toBeCloseTo(3 / 1024, 10);
    expect(getBase64SizeKB('A'.repeat(4096))).toBeCloseTo(3, 10);
  });

  it('subtracts the padding characters at the end', () => {
    // "QQ==" is 1 byte and "QUI=" is 2 bytes.
    expect(getBase64SizeKB('QQ==')).toBeCloseTo(1 / 1024, 10);
    expect(getBase64SizeKB('QUI=')).toBeCloseTo(2 / 1024, 10);
  });

  it('also works on plain base64 without the data URL prefix', () => {
    expect(getBase64SizeKB('AAAA')).toBeCloseTo(3 / 1024, 10);
  });

  it('returns 0 for empty or non-string input', () => {
    expect(getBase64SizeKB('')).toBe(0);
    expect(getBase64SizeKB(undefined)).toBe(0);
    expect(getBase64SizeKB(12345)).toBe(0);
  });
});

describe('optimizeToTargetSize (JPEG quality search)', () => {
  it('finds the highest quality that still fits the target', () => {
    // Size grows with quality: 200 KB at quality 1, so 100 KB happens at 0.5.
    const canvas = makeFakeCanvas((quality) => 200 * quality);

    const result = optimizeToTargetSize(canvas, 'image/jpeg', 100);

    expect(result.targetMet).toBe(true);
    expect(result.sizeKB).toBeLessThanOrEqual(100);
    expect(result.quality).toBeGreaterThan(0.49);
    expect(result.quality).toBeLessThan(0.502);
  });

  it('gives a lower quality for a smaller target', () => {
    const canvas = makeFakeCanvas((quality) => 200 * quality);

    const strict = optimizeToTargetSize(canvas, 'image/jpeg', 40);
    const relaxed = optimizeToTargetSize(canvas, 'image/jpeg', 120);

    expect(strict.quality).toBeLessThan(relaxed.quality);
    expect(strict.sizeKB).toBeLessThanOrEqual(40);
    expect(relaxed.sizeKB).toBeLessThanOrEqual(120);
  });

  it('stays at the maximum quality when everything already fits', () => {
    const canvas = makeFakeCanvas(() => 10);

    const result = optimizeToTargetSize(canvas, 'image/jpeg', 100, 0.8);

    expect(result.targetMet).toBe(true);
    expect(result.quality).toBeLessThanOrEqual(0.8);
    expect(result.quality).toBeGreaterThan(0.79);
  });

  it('never goes above the maximum quality it was given', () => {
    const canvas = makeFakeCanvas(() => 10);

    const result = optimizeToTargetSize(canvas, 'image/jpeg', 100, 0.5);

    expect(result.quality).toBeLessThanOrEqual(0.5);
  });

  it('falls back to 0.8 when the maximum quality is invalid, and caps it at 1', () => {
    const canvas = makeFakeCanvas(() => 10);

    const fromZero = optimizeToTargetSize(canvas, 'image/jpeg', 100, 0);
    const fromHuge = optimizeToTargetSize(canvas, 'image/jpeg', 100, 5);

    expect(fromZero.quality).toBeLessThanOrEqual(0.8);
    expect(fromZero.quality).toBeGreaterThan(0.79);
    expect(fromHuge.quality).toBeLessThanOrEqual(1);
    expect(fromHuge.quality).toBeGreaterThan(0.98);
  });

  it('reports failure at the lowest quality when the target is impossible', () => {
    const canvas = makeFakeCanvas(() => 500);

    const result = optimizeToTargetSize(canvas, 'image/jpeg', 10);

    expect(result.targetMet).toBe(false);
    expect(result.quality).toBe(0.01);
    expect(result.sizeKB).toBeGreaterThan(10);
  });

  it('is bounded: at most 8 search encodes plus 1 fallback encode', () => {
    const reachable = makeFakeCanvas((quality) => 200 * quality);
    optimizeToTargetSize(reachable, 'image/jpeg', 100);
    expect(reachable.toDataURL).toHaveBeenCalledTimes(8);

    const impossible = makeFakeCanvas(() => 500);
    optimizeToTargetSize(impossible, 'image/jpeg', 10);
    expect(impossible.toDataURL).toHaveBeenCalledTimes(9);
  });

  it('rejects a target that is zero, negative or not a number', () => {
    const canvas = makeFakeCanvas(() => 10);

    expect(() => optimizeToTargetSize(canvas, 'image/jpeg', 0)).toThrow('greater than 0 KB');
    expect(() => optimizeToTargetSize(canvas, 'image/jpeg', -5)).toThrow('greater than 0 KB');
    expect(() => optimizeToTargetSize(canvas, 'image/jpeg', Number.NaN)).toThrow('greater than 0 KB');
    expect(() => optimizeToTargetSize(canvas, 'image/jpeg', undefined)).toThrow('greater than 0 KB');
  });
});

describe('buildPdfAtQuality', () => {
  it('adds one full-size page per canvas', async () => {
    pdfSpies.addPage.mockClear();
    pdfSpies.drawImage.mockClear();
    pdfSpies.embedJpg.mockClear();

    const pages = [
      makeFakeCanvas(() => 10, 300, 400),
      makeFakeCanvas(() => 10, 500, 200),
    ];

    const result = await buildPdfAtQuality(pages, 0.6);

    expect(pdfSpies.embedJpg).toHaveBeenCalledTimes(2);
    expect(pdfSpies.addPage).toHaveBeenNthCalledWith(1, [300, 400]);
    expect(pdfSpies.addPage).toHaveBeenNthCalledWith(2, [500, 200]);
    expect(pdfSpies.drawImage).toHaveBeenCalledTimes(2);
    expect(result.sizeKB).toBe(2);
  });

  it('encodes every page at the requested quality', async () => {
    const pages = [makeFakeCanvas(() => 10), makeFakeCanvas(() => 10)];

    await buildPdfAtQuality(pages, 0.37);

    pages.forEach((canvas) => {
      expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.37);
    });
  });
});

describe('compressPdfToTargetSize (one quality for the whole document)', () => {
  it('finds a quality where all pages together fit the target', async () => {
    // Three pages, each 100 KB at quality 1, so 300 KB in total at quality 1.
    const pages = [1, 2, 3].map(() => makeFakeCanvas((quality) => 100 * quality));

    const result = await compressPdfToTargetSize(pages, 150);

    expect(result.targetMet).toBe(true);

    // The estimate for the whole document at the chosen quality must be within target.
    const totalAtChosenQuality = pages.length * 100 * result.quality;
    expect(totalAtChosenQuality).toBeLessThanOrEqual(150);
    expect(result.quality).toBeGreaterThan(0.45);
    expect(result.quality).toBeLessThan(0.51);
  });

  it('uses the same quality for every page when building the final PDF', async () => {
    const pages = [1, 2, 3].map(() => makeFakeCanvas((quality) => 100 * quality));

    const result = await compressPdfToTargetSize(pages, 150);

    pages.forEach((canvas) => {
      const lastCall = canvas.toDataURL.mock.calls.at(-1);
      expect(lastCall[1]).toBe(result.quality);
    });
  });

  it('does 7 cheap size estimates per page and then builds the PDF once', async () => {
    const pages = [1, 2, 3].map(() => makeFakeCanvas((quality) => 100 * quality));

    await compressPdfToTargetSize(pages, 150);

    // 7 search rounds plus 1 final encode while building.
    pages.forEach((canvas) => {
      expect(canvas.toDataURL).toHaveBeenCalledTimes(8);
    });
  });

  it('builds at the lowest quality and reports failure when the target is impossible', async () => {
    const pages = [1, 2].map(() => makeFakeCanvas(() => 400));

    const result = await compressPdfToTargetSize(pages, 10);

    expect(result.targetMet).toBe(false);
    expect(result.quality).toBe(0.01);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
  });

  it('respects the maximum quality', async () => {
    const pages = [makeFakeCanvas(() => 5)];

    const result = await compressPdfToTargetSize(pages, 500, 0.4);

    expect(result.targetMet).toBe(true);
    expect(result.quality).toBeLessThanOrEqual(0.4);
  });

  it('rejects a target that is zero or negative', async () => {
    const pages = [makeFakeCanvas(() => 5)];

    await expect(compressPdfToTargetSize(pages, 0)).rejects.toThrow('greater than 0 KB');
    await expect(compressPdfToTargetSize(pages, -1)).rejects.toThrow('greater than 0 KB');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { optimizeHeicToTarget } from './heic';

// A pretend HEIC encoder. `sizeKBAtQuality` decides how big the file is for a
// given quality (1 to 100), so each test can describe how the "encoder" behaves.
function makeFakeEncoder(sizeKBAtQuality) {
  return vi.fn(async (canvas, quality) => {
    const bytes = new Uint8Array(Math.round(sizeKBAtQuality(quality) * 1024));
    return new Blob([bytes], { type: 'image/heic' });
  });
}

const anyCanvas = {};

describe('optimizeHeicToTarget (HEIC quality search)', () => {
  it('finds the highest quality that fits the target', async () => {
    // 2 KB per quality point, so a 100 KB target is reached at quality 50.
    const encode = makeFakeEncoder((quality) => quality * 2);

    const result = await optimizeHeicToTarget(anyCanvas, 100, 1, encode);

    expect(result.targetMet).toBe(true);
    expect(result.quality).toBe(0.5);
    expect(result.sizeKB).toBe(100);
  });

  it('never searches above the starting quality', async () => {
    // Everything fits, so the answer is capped by the starting quality of 30.
    const encode = makeFakeEncoder((quality) => quality);

    const result = await optimizeHeicToTarget(anyCanvas, 500, 0.3, encode);

    expect(result.targetMet).toBe(true);
    expect(result.quality).toBe(0.3);

    const qualitiesTried = encode.mock.calls.map((call) => call[1]);
    expect(Math.max(...qualitiesTried)).toBeLessThanOrEqual(30);
  });

  it('returns the smallest file it found when the target is impossible', async () => {
    // Even quality 1 produces 20 KB, which is above the 5 KB target.
    const encode = makeFakeEncoder((quality) => quality * 20);

    const result = await optimizeHeicToTarget(anyCanvas, 5, 1, encode);

    expect(result.targetMet).toBe(false);
    expect(result.quality).toBe(0.01);
    expect(result.sizeKB).toBe(20);
  });

  it('needs at most 7 encodes to search 100 quality levels', async () => {
    const encode = makeFakeEncoder((quality) => quality * 2);

    await optimizeHeicToTarget(anyCanvas, 100, 1, encode);

    expect(encode.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it('keeps the quality in the 1 to 100 range even for odd starting values', async () => {
    const encode = makeFakeEncoder(() => 1);

    const tooLow = await optimizeHeicToTarget(anyCanvas, 10, 0, encode);
    expect(tooLow.quality).toBe(0.01);

    const tooHigh = await optimizeHeicToTarget(anyCanvas, 10, 7, encode);
    expect(tooHigh.quality).toBe(1);
  });

  it('passes the canvas through to the encoder', async () => {
    const encode = makeFakeEncoder(() => 1);
    const canvas = { name: 'my-canvas' };

    await optimizeHeicToTarget(canvas, 10, 0.5, encode);

    expect(encode.mock.calls[0][0]).toBe(canvas);
  });
});

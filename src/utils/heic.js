// HEIC encoding and the quality search for it.
//
// Canvas cannot produce HEIC files, so encoding is done by icodec (WebAssembly).
// icodec's HEIC encoder has to run inside a module worker, which is why the
// actual encoding lives in heicEncoder.worker.js.

export const NOT_ISOLATED_MESSAGE =
  'HEIC output needs a cross-origin isolated page. Serve the app with the headers ' +
  'Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.';

export function encodeHeic(canvas, quality) {
  return new Promise((resolve, reject) => {
    // Without isolation the encoder's worker fails silently and never answers, which
    // would leave the page spinning forever. Fail early with a clear message instead.
    if (!globalThis.crossOriginIsolated) {
      reject(new Error(NOT_ISOLATED_MESSAGE));
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('Could not create a canvas context.'));
      return;
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const worker = new Worker(new URL('../heicEncoder.worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = ({ data }) => {
      worker.terminate();

      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(new Blob([data.bytes], { type: 'image/heic' }));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'HEIC encoder worker failed.'));
    };

    const message = {
      width: canvas.width,
      height: canvas.height,
      pixels: imageData.data.buffer,
      quality,
    };

    // The pixel buffer is transferred to the worker instead of being copied.
    worker.postMessage(message, [imageData.data.buffer]);
  });
}

// Binary-searches the HEIC quality (1 to 100) for the highest quality whose file
// still fits inside targetKB. The search never goes above startingQuality.
//
// If even the lowest quality is too big, the smallest file found is returned
// with targetMet set to false.
//
// `encode` is a parameter so the search can be tested without a real encoder.
export async function optimizeHeicToTarget(canvas, targetKB, startingQuality, encode = encodeHeic) {
  const targetBytes = targetKB * 1024;

  let low = 1;
  let high = Math.max(1, Math.min(100, Math.round(startingQuality * 100)));

  let best = null;
  let smallest = null;

  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const blob = await encode(canvas, quality);

    if (!smallest || blob.size < smallest.blob.size) {
      smallest = { blob, quality };
    }

    if (blob.size <= targetBytes) {
      // It fits, so remember it and try a higher quality.
      best = { blob, quality };
      low = quality + 1;
    } else {
      // Too big, so try a lower quality.
      high = quality - 1;
    }
  }

  const result = best || smallest;

  return {
    blob: result.blob,
    sizeKB: result.blob.size / 1024,
    quality: result.quality / 100,
    targetMet: Boolean(best),
  };
}

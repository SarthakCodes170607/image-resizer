import { heic } from 'icodec';
import heicEncoderWasm from 'icodec/heic-enc.wasm?url';

self.onmessage = async ({ data: { width, height, pixels, quality } }) => {
  try {
    await heic.loadEncoder(heicEncoderWasm);
    const image = new ImageData(new Uint8ClampedArray(pixels), width, height);
    const bytes = heic.encode(image, {
      quality,
      threads: 1,
      preset: 'medium',
      tune: 'ssim',
      chroma: '420',
    });
    self.postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'HEIC encoding failed.' });
  }
};

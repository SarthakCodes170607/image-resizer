import { heic } from 'icodec';
import heicDecoderWasm from 'icodec/heic-dec.wasm?url';
import { canvasFromImage, loadImage } from './canvas';
import { getExtension, imageFormatFor, isHeic } from './fileTypes';
import { pdfToPageCanvases } from './pdfPages';

// Decodes an uploaded file into canvases that the rest of the app can work with.
async function loadAsset(file) {
  const extension = getExtension(file.name);

  if (extension === 'pdf') {
    const pageCanvases = await pdfToPageCanvases(file);
    if (pageCanvases.length === 0) {
      throw new Error('This PDF has no pages to render.');
    }

    return { isPdf: true, pageCanvases, previewCanvas: pageCanvases[0] };
  }

  if (isHeic(extension)) {
    await heic.loadDecoder(heicDecoderWasm);
    const imageData = heic.decode(new Uint8Array(await file.arrayBuffer()));

    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create a canvas context.');
    }

    context.putImageData(imageData, 0, 0);
    return { isPdf: false, canvas, previewCanvas: canvas };
  }

  // JPEG and PNG are decoded by the browser itself.
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const canvas = canvasFromImage(image);
    return { isPdf: false, canvas, previewCanvas: canvas };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Builds the "item" object the UI keeps for each uploaded file.
export async function createItemFromFile(file) {
  const extension = getExtension(file.name);
  const asset = await loadAsset(file);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    originalKB: file.size / 1024,
    isPdf: asset.isPdf,
    format: asset.isPdf ? null : imageFormatFor(extension),
    canvas: asset.isPdf ? null : asset.canvas,
    pageCanvases: asset.isPdf ? asset.pageCanvases : null,
    previewUrl: asset.previewCanvas.toDataURL('image/png'),
  };
}

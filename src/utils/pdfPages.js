import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Renders every page of a PDF file onto its own canvas.
export async function pdfToPageCanvases(file) {
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: fileBytes }).promise;

  try {
    const canvases = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber = pageNumber + 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.75 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        throw new Error('Could not create a canvas context.');
      }

      await page.render({ canvasContext: context, viewport, background: 'white' }).promise;
      page.cleanup();
      canvases.push(canvas);
    }

    return canvases;
  } finally {
    if (typeof pdf.cleanup === 'function') {
      pdf.cleanup();
    }

    if (typeof pdf.destroy === 'function') {
      await pdf.destroy();
    }
  }
}

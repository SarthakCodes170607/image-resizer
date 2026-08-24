import { PDFDocument } from 'pdf-lib';

export const getBase64SizeKB = (dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl) return 0;
  const commaIndex = dataUrl.indexOf(',');
  const base64Data = commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  return ((base64Data.length * 3) / 4 - padding) / 1024;
};

export const optimizeToTargetSize = (canvas, format, targetKB, maxQuality = 0.8) => {
  const target = Number(targetKB);
  const highestQuality = Math.min(1, Math.max(0.01, Number(maxQuality) || 0.8));
  if (!Number.isFinite(target) || target <= 0) throw new Error('Target size must be greater than 0 KB.');

  let low = 0.01;
  let high = highestQuality;
  let best = null;

  for (let i = 0; i < 8; i += 1) {
    const quality = (low + high) / 2;
    const dataUrl = canvas.toDataURL(format, quality);
    const sizeKB = getBase64SizeKB(dataUrl);
    if (sizeKB <= target) {
      best = { dataUrl, quality, sizeKB };
      low = quality;
    } else {
      high = quality;
    }
  }

  if (best) return { ...best, targetMet: true };
  const dataUrl = canvas.toDataURL(format, 0.01);
  return { dataUrl, quality: 0.01, sizeKB: getBase64SizeKB(dataUrl), targetMet: false };
};

// --- PDF-to-PDF compression below ---

const dataUrlToUint8Array = (dataUrl) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const jpegSizeAtQuality = (canvas, quality) => getBase64SizeKB(canvas.toDataURL('image/jpeg', quality));

// Rebuilds a PDF by re-encoding every page's canvas as a JPEG at the given
// quality and embedding it as a full-page image. This is a rasterize +
// re-embed approach — it will shrink scanned/image-heavy PDFs a lot, but
// text will no longer be selectable in the output (it becomes a picture of
// the text, same as any raster-based PDF compressor).
export const buildPdfAtQuality = async (pageCanvases, quality) => {
  const pdfDoc = await PDFDocument.create();
  for (const canvas of pageCanvases) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const jpgImage = await pdfDoc.embedJpg(dataUrlToUint8Array(dataUrl));
    const page = pdfDoc.addPage([canvas.width, canvas.height]);
    page.drawImage(jpgImage, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  }
  const bytes = await pdfDoc.save();
  return { bytes, sizeKB: bytes.byteLength / 1024 };
};

// Binary-searches ONE JPEG quality shared across all pages so the whole
// document lands under targetKB. Estimates size cheaply per-iteration
// (just measuring JPEG data URLs, no pdf-lib work) and only builds the
// final PDF once, at the winning quality.
export const compressPdfToTargetSize = async (pageCanvases, targetKB, maxQuality = 0.8) => {
  const target = Number(targetKB);
  const highestQuality = Math.min(1, Math.max(0.01, Number(maxQuality) || 0.8));
  if (!Number.isFinite(target) || target <= 0) throw new Error('Target size must be greater than 0 KB.');

  const estimateTotalKB = (quality) =>
    pageCanvases.reduce((sum, canvas) => sum + jpegSizeAtQuality(canvas, quality), 0);

  let low = 0.01;
  let high = highestQuality;
  let bestQuality = null;

  for (let i = 0; i < 7; i += 1) {
    const quality = (low + high) / 2;
    if (estimateTotalKB(quality) <= target) {
      bestQuality = quality;
      low = quality;
    } else {
      high = quality;
    }
  }

  const finalQuality = bestQuality ?? 0.01;
  const { bytes, sizeKB } = await buildPdfAtQuality(pageCanvases, finalQuality);
  return { bytes, quality: finalQuality, sizeKB, targetMet: bestQuality !== null };
};
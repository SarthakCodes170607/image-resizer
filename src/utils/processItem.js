import { canvasToBlob, dataUrlToBlob, scaledCanvas } from './canvas';
import { buildPdfAtQuality, compressPdfToTargetSize, optimizeToTargetSize } from './compressor';
import { encodeHeic, optimizeHeicToTarget } from './heic';

// Every function here returns an object with the same core fields:
//   blob      the compressed file
//   sizeKB    its size in kilobytes
//   quality   the quality that was used (0 to 1), or null for lossless PNG
//   targetMet whether the file is at or under the target size

async function compressJpeg(canvas, config) {
  let encoded;

  if (config.enforceTargetKB) {
    encoded = optimizeToTargetSize(canvas, 'image/jpeg', config.targetKB, config.quality);
  } else {
    encoded = {
      dataUrl: canvas.toDataURL('image/jpeg', config.quality),
      quality: config.quality,
      targetMet: true,
    };
  }

  const blob = await dataUrlToBlob(encoded.dataUrl);

  return {
    blob,
    sizeKB: blob.size / 1024,
    quality: encoded.quality,
    targetMet: encoded.targetMet,
  };
}

// PNG is lossless, so there is no quality to search. Only the scale slider can
// make the file smaller, and we simply report whether the target was met.
async function compressPng(canvas, config) {
  const blob = await canvasToBlob(canvas, 'image/png');

  return {
    blob,
    sizeKB: blob.size / 1024,
    quality: null,
    targetMet: !config.enforceTargetKB || blob.size <= config.targetKB * 1024,
  };
}

async function compressHeic(canvas, config) {
  if (config.enforceTargetKB) {
    return optimizeHeicToTarget(canvas, config.targetKB, config.quality);
  }

  const blob = await encodeHeic(canvas, Math.round(config.quality * 100));

  return {
    blob,
    sizeKB: blob.size / 1024,
    quality: config.quality,
    targetMet: true,
  };
}

async function processPdf(item, config) {
  const scaledPages = item.pageCanvases.map((canvas) => scaledCanvas(canvas, config.scaleFactor));

  let result;

  if (config.enforceTargetKB) {
    result = await compressPdfToTargetSize(scaledPages, config.targetKB, config.quality);
  } else {
    const built = await buildPdfAtQuality(scaledPages, config.quality);
    result = { ...built, quality: config.quality, targetMet: true };
  }

  const output = {
    isPdf: true,
    blob: new Blob([result.bytes], { type: 'application/pdf' }),
    sizeKB: result.sizeKB,
    quality: result.quality,
    targetMet: result.targetMet,
    reductionRatio: (1 - result.sizeKB / item.originalKB) * 100,
    pageCount: scaledPages.length,
  };

  const warning = result.targetMet
    ? ''
    : `The ${config.targetKB} KB target could not be reached at the minimum quality.`;

  return { output, warning };
}

async function processImage(item, config) {
  const canvas = scaledCanvas(item.canvas, config.scaleFactor);
  const mime = item.format.mime;

  let result;

  if (mime === 'image/jpeg') {
    result = await compressJpeg(canvas, config);
  } else if (mime === 'image/png') {
    result = await compressPng(canvas, config);
  } else {
    result = await compressHeic(canvas, config);
  }

  const output = {
    isPdf: false,
    ...result,
    extension: item.format.extension,
    label: item.format.label,
    reductionRatio: (1 - result.sizeKB / item.originalKB) * 100,
    resWidth: canvas.width,
    resHeight: canvas.height,
  };

  const warning = result.targetMet
    ? ''
    : `The ${config.targetKB} KB target could not be reached at the available quality settings.`;

  return { output, warning };
}

// Compresses one uploaded item using the current settings.
// Returns { output, warning }. `warning` is an empty string when all went well.
export function processItem(item, config) {
  if (item.isPdf) {
    return processPdf(item, config);
  }

  return processImage(item, config);
}

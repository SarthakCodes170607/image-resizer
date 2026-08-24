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

  if (!Number.isFinite(target) || target <= 0) {
    throw new Error('Target size must be greater than 0 KB.');
  }

  let low = 0.01;
  let high = highestQuality;
  let best = null;

  // JPEG/WebP sizes are not perfectly linear, but binary search is a fast
  // approximation. Keep the largest quality that meets the requested limit.
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
  return {
    dataUrl,
    quality: 0.01,
    sizeKB: getBase64SizeKB(dataUrl),
    targetMet: false,
  };
};

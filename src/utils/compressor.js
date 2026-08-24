export const getBase64SizeKB = (dataUrl) => {
  if (!dataUrl) return '0.00';
  const base64Parts = dataUrl.split(',');
  const base64Data = base64Parts[1] || base64Parts[0];
  const padding = (base64Data.match(/=/g) || []).length;
  const bytes = (base64Data.length * 0.75) - padding;
  return (bytes / 1024).toFixed(2);
};

export const optimizeToTargetSize = (canvas, format, targetKB) => {
  let low = 0.01;
  let high = 1.0;
  let optimalUrl = null;
  let optimalQuality = 0.8;

  for (let i = 0; i < 6; i++) {
    const mid = (low + high) / 2;
    const currentDataUrl = canvas.toDataURL(format, mid);
    const currentSize = parseFloat(getBase64SizeKB(currentDataUrl));

    if (currentSize <= targetKB) {
      optimalUrl = currentDataUrl;
      optimalQuality = mid;
      low = mid; 
    } else {
      high = mid; 
    }
  }

  return {
    dataUrl: optimalUrl || canvas.toDataURL(format, 0.01),
    quality: optimalQuality,
  };
};
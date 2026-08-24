const compressToTargetSize = async () => {
  if (!imageFile || targetKB <= 0) return;
  setProcessing(true);

  const targetBytes = targetKB * 1024;
  const img = new Image();
  const initialUrl = URL.createObjectURL(imageFile);
  img.src = initialUrl;

  img.onload = async () => {
    // Release initial object URL from memory
    URL.revokeObjectURL(initialUrl);

    let scale = 1.0;
    let bestBlob = null;
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');

    // Outer loop: scale down canvas dimensions if quality compression hits limits
    while (scale > 0.05) {
      canvas.width = Math.max(1, Math.floor(img.width * scale));
      canvas.height = Math.max(1, Math.floor(img.height * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      let min = 0.01;
      let max = 1.0;
      let iterations = 0;

      // Binary search over JPEG quality
      while (min <= max && iterations < 7) {
        const mid = (min + max) / 2;
        const blob = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', mid)
        );

        if (blob) {
          bestBlob = blob;
          if (blob.size > targetBytes) {
            max = mid - 0.05;
          } else {
            min = mid + 0.05;
          }
        }
        iterations++;
      }

      // Break outer loop if target size achieved
      if (bestBlob && bestBlob.size <= targetBytes) break;

      // Scale down image dimensions by 20% if quality reduction wasn't enough
      scale -= 0.2;
    }

    if (bestBlob) {
      if (resizedImage) URL.revokeObjectURL(resizedImage);
      const url = URL.createObjectURL(bestBlob);
      setResizedImage(url);
      setStats({
        originalSize: (imageFile.size / 1024).toFixed(1),
        finalSize: (bestBlob.size / 1024).toFixed(1),
      });
    }
    setProcessing(false);
  };
};
// Helpers for turning images into canvases and canvases into files.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve(image);
    };

    image.onerror = () => {
      reject(new Error('The browser could not decode this image.'));
    };

    image.src = src;
  });
}

export function canvasFromImage(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('The decoded image has no dimensions.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create a canvas context.');
  }

  context.drawImage(image, 0, 0);
  return canvas;
}

// scaleFactor is a percentage from 10 to 100.
export function scaledCanvas(source, scaleFactor) {
  const width = Math.max(1, Math.round((source.width * scaleFactor) / 100));
  const height = Math.max(1, Math.round((source.height * scaleFactor) / 100));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create a canvas context.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Could not encode ${mime}.`));
        }
      },
      mime,
      quality,
    );
  });
}

export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

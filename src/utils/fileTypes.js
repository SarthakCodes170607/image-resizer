// Small helpers for working with file names, file types and upload limits.

export const MAX_FILE_SIZE_MB = 25;

export const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);

// "Photo.JPG" -> "jpg"
export function getExtension(fileName) {
  const lastPart = fileName.split('.').pop();
  const lowerCased = lastPart?.toLowerCase();
  return lowerCased || '';
}

// "holiday.photo.jpg" -> "holiday.photo"
export function baseName(fileName) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, '');
  return withoutExtension || 'image';
}

export function isHeic(extension) {
  return extension === 'heic' || extension === 'heif';
}

// Describes the output format for an image. The output always matches the input.
export function imageFormatFor(extension) {
  if (extension === 'jpg' || extension === 'jpeg') {
    return { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' };
  }

  if (extension === 'png') {
    return { mime: 'image/png', extension: 'png', label: 'PNG' };
  }

  if (isHeic(extension)) {
    return { mime: 'image/heic', extension: 'heic', label: 'HEIC' };
  }

  throw new Error('Unsupported image format.');
}

// Returns a message explaining why a file cannot be used, or null if it is fine.
export function getFileProblem(file) {
  const extension = getExtension(file.name);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return `“${file.name}” is not a supported file type.`;
  }

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `“${file.name}” exceeds the ${MAX_FILE_SIZE_MB} MB limit.`;
  }

  return null;
}

import { describe, expect, it } from 'vitest';
import { MAX_FILE_SIZE_MB, baseName, getExtension, getFileProblem, imageFormatFor, isHeic } from './fileTypes';

describe('getExtension', () => {
  it('returns the lower-case extension', () => {
    expect(getExtension('Photo.JPG')).toBe('jpg');
    expect(getExtension('archive.tar.gz')).toBe('gz');
  });
});

describe('baseName', () => {
  it('removes only the final extension', () => {
    expect(baseName('holiday.photo.jpg')).toBe('holiday.photo');
  });

  it('falls back to "image" when nothing is left', () => {
    expect(baseName('.png')).toBe('image');
  });
});

describe('isHeic', () => {
  it('accepts both HEIC spellings', () => {
    expect(isHeic('heic')).toBe(true);
    expect(isHeic('heif')).toBe(true);
    expect(isHeic('jpg')).toBe(false);
  });
});

describe('imageFormatFor', () => {
  it('keeps the output format the same as the input', () => {
    expect(imageFormatFor('jpg')).toEqual({ mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' });
    expect(imageFormatFor('jpeg')).toEqual({ mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' });
    expect(imageFormatFor('png')).toEqual({ mime: 'image/png', extension: 'png', label: 'PNG' });
    expect(imageFormatFor('heif')).toEqual({ mime: 'image/heic', extension: 'heic', label: 'HEIC' });
  });

  it('throws for formats it cannot handle', () => {
    expect(() => imageFormatFor('gif')).toThrow('Unsupported image format.');
  });
});

describe('getFileProblem', () => {
  it('accepts a supported file of normal size', () => {
    expect(getFileProblem({ name: 'cat.png', size: 1024 })).toBeNull();
  });

  it('rejects an unsupported file type', () => {
    expect(getFileProblem({ name: 'cat.gif', size: 1024 })).toContain('not a supported file type');
  });

  it('rejects a file over the size limit', () => {
    const tooBig = { name: 'huge.pdf', size: (MAX_FILE_SIZE_MB + 1) * 1024 * 1024 };
    expect(getFileProblem(tooBig)).toContain(`${MAX_FILE_SIZE_MB} MB limit`);
  });

  it('accepts a file exactly at the size limit', () => {
    const exactly = { name: 'edge.pdf', size: MAX_FILE_SIZE_MB * 1024 * 1024 };
    expect(getFileProblem(exactly)).toBeNull();
  });
});

import { useCallback, useEffect, useRef } from 'react';

// Keeps track of the temporary download links (blob URLs) the app creates, so
// that old ones are released and nothing leaks when the page is closed.
export function useObjectUrls() {
  const allUrlsRef = useRef(new Set());
  const outputUrlByItemRef = useRef({});

  // When the component unmounts, release every URL that is still alive.
  useEffect(() => {
    const allUrls = allUrlsRef.current;

    return () => {
      allUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const createObjectUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    allUrlsRef.current.add(url);
    return url;
  }, []);

  // Each item has one current download link. Storing a new one releases the old one.
  const replaceOutputUrl = useCallback((itemId, url) => {
    const previous = outputUrlByItemRef.current[itemId];

    if (previous) {
      URL.revokeObjectURL(previous);
      allUrlsRef.current.delete(previous);
    }

    outputUrlByItemRef.current[itemId] = url;
  }, []);

  return { createObjectUrl, replaceOutputUrl };
}

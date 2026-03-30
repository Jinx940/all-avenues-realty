import { useEffect, useState } from 'react';
import { buildAssetUrl, fetchAssetBlob } from './api';

const directAssetPattern = /^(blob:|data:)/i;

const assetOrigin = (value: string) => {
  try {
    return new URL(value, window.location.origin).origin;
  } catch {
    return '';
  }
};

const shouldLoadAsBlob = (value: string) => {
  if (!value || directAssetPattern.test(value)) {
    return false;
  }

  const resolvedOrigin = assetOrigin(value);
  if (!resolvedOrigin) {
    return false;
  }

  const appOrigin = window.location.origin;
  const apiOrigin = assetOrigin(buildAssetUrl('/'));
  return resolvedOrigin === appOrigin || resolvedOrigin === apiOrigin;
};

const withMimeType = async (blob: Blob, forcedMimeType?: string) => {
  if (!forcedMimeType || blob.type === forcedMimeType) {
    return blob;
  }

  return new Blob([await blob.arrayBuffer()], { type: forcedMimeType });
};

export const useProtectedAssetUrl = (sourceUrl: string | null, forcedMimeType?: string) => {
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolvedSourceUrl = sourceUrl ? buildAssetUrl(sourceUrl) : null;

    if (!resolvedSourceUrl) {
      setAssetUrl(null);
      setIsLoading(false);
      setError(null);
      return undefined;
    }

    if (!shouldLoadAsBlob(resolvedSourceUrl)) {
      setAssetUrl(resolvedSourceUrl);
      setIsLoading(false);
      setError(null);
      return undefined;
    }

    let isActive = true;
    let nextObjectUrl: string | null = null;

    setAssetUrl(null);
    setIsLoading(true);
    setError(null);

    void fetchAssetBlob(resolvedSourceUrl)
      .then((blob) => withMimeType(blob, forcedMimeType))
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        if (!isActive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        nextObjectUrl = objectUrl;
        setAssetUrl(objectUrl);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isActive) return;
        setAssetUrl(null);
        setIsLoading(false);
        setError(loadError instanceof Error ? loadError.message : 'Could not load the protected file.');
      });

    return () => {
      isActive = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [sourceUrl, forcedMimeType]);

  return { assetUrl, isLoading, error };
};

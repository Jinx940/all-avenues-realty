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

type ProtectedAssetRequestState = {
  requestKey: string;
  assetUrl: string | null;
  error: string | null;
};

export const useProtectedAssetUrl = (sourceUrl: string | null, forcedMimeType?: string) => {
  const [requestState, setRequestState] = useState<ProtectedAssetRequestState>({
    requestKey: '',
    assetUrl: null,
    error: null,
  });
  const resolvedSourceUrl = sourceUrl ? buildAssetUrl(sourceUrl) : null;
  const shouldFetchAsBlob = resolvedSourceUrl ? shouldLoadAsBlob(resolvedSourceUrl) : false;
  const requestKey = resolvedSourceUrl ? `${resolvedSourceUrl}::${forcedMimeType ?? ''}` : '';

  useEffect(() => {
    if (!resolvedSourceUrl || !shouldFetchAsBlob) {
      return undefined;
    }

    let isActive = true;
    let nextObjectUrl: string | null = null;

    void fetchAssetBlob(resolvedSourceUrl)
      .then((blob) => withMimeType(blob, forcedMimeType))
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        if (!isActive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        nextObjectUrl = objectUrl;
        setRequestState((currentState) => {
          if (
            currentState.requestKey === requestKey &&
            currentState.assetUrl === objectUrl &&
            currentState.error === null
          ) {
            return currentState;
          }

          return {
            requestKey,
            assetUrl: objectUrl,
            error: null,
          };
        });
      })
      .catch((loadError) => {
        if (!isActive) return;
        const errorMessage =
          loadError instanceof Error ? loadError.message : 'Could not load the protected file.';
        setRequestState((currentState) => {
          if (
            currentState.requestKey === requestKey &&
            currentState.assetUrl === null &&
            currentState.error === errorMessage
          ) {
            return currentState;
          }

          return {
            requestKey,
            assetUrl: null,
            error: errorMessage,
          };
        });
      });

    return () => {
      isActive = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [forcedMimeType, requestKey, resolvedSourceUrl, shouldFetchAsBlob]);

  if (!resolvedSourceUrl) {
    return { assetUrl: null, isLoading: false, error: null };
  }

  if (!shouldFetchAsBlob) {
    return { assetUrl: resolvedSourceUrl, isLoading: false, error: null };
  }

  if (requestState.requestKey !== requestKey) {
    return { assetUrl: null, isLoading: true, error: null };
  }

  return {
    assetUrl: requestState.assetUrl,
    isLoading: false,
    error: requestState.error,
  };
};

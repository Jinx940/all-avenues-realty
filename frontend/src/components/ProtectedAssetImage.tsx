import { useEffect, type ReactNode } from 'react';
import { useProtectedAssetUrl } from '../lib/protectedAsset';

export type ProtectedAssetLoadState = 'idle' | 'loading' | 'ready' | 'error';

export function ProtectedAssetImage({
  src,
  alt,
  className,
  mimeType,
  loadingFallback,
  errorFallback,
  onStateChange,
}: {
  src: string | null;
  alt: string;
  className: string;
  mimeType?: string;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode | ((message: string) => ReactNode);
  onStateChange?: (state: ProtectedAssetLoadState) => void;
}) {
  const { assetUrl, isLoading, error } = useProtectedAssetUrl(src, mimeType);

  useEffect(() => {
    if (!src) {
      onStateChange?.('idle');
      return;
    }

    if (isLoading) {
      onStateChange?.('loading');
      return;
    }

    onStateChange?.(!assetUrl || error ? 'error' : 'ready');
  }, [assetUrl, error, isLoading, onStateChange, src]);

  if (isLoading) {
    return (
      loadingFallback ?? (
        <div className={`${className} protected-asset-shell`.trim()}>
          <strong>Loading image...</strong>
        </div>
      )
    );
  }

  if (!assetUrl || error) {
    const errorMessage = error || 'Could not load the protected file.';
    return (
      (typeof errorFallback === 'function' ? errorFallback(errorMessage) : errorFallback) ?? (
        <div className={`${className} protected-asset-shell`.trim()}>
          <strong>Image unavailable</strong>
          <span>{errorMessage}</span>
        </div>
      )
    );
  }

  return <img className={className} src={assetUrl} alt={alt} />;
}

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useProtectedAssetUrl } from '../lib/protectedAsset';
import type { ProtectedAssetDimensions, ProtectedAssetLoadState } from './protectedAssetState';

export function ProtectedAssetImage({
  src,
  alt,
  className,
  mimeType,
  style,
  loadingFallback,
  errorFallback,
  onStateChange,
  onDimensionsChange,
}: {
  src: string | null;
  alt: string;
  className: string;
  mimeType?: string;
  style?: CSSProperties;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode | ((message: string) => ReactNode);
  onStateChange?: (state: ProtectedAssetLoadState) => void;
  onDimensionsChange?: (dimensions: ProtectedAssetDimensions | null) => void;
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

  useEffect(() => {
    if (!src || isLoading || !assetUrl || error) {
      onDimensionsChange?.(null);
    }
  }, [assetUrl, error, isLoading, onDimensionsChange, src]);

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

  return (
    <img
      className={className}
      src={assetUrl}
      alt={alt}
      style={style}
      onLoad={(event) =>
        onDimensionsChange?.({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
    />
  );
}

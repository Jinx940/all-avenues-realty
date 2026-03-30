import type { ReactNode } from 'react';
import { useProtectedAssetUrl } from '../lib/protectedAsset';

export function ProtectedAssetImage({
  src,
  alt,
  className,
  mimeType,
  loadingFallback,
  errorFallback,
}: {
  src: string | null;
  alt: string;
  className: string;
  mimeType?: string;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
}) {
  const { assetUrl, isLoading, error } = useProtectedAssetUrl(src, mimeType);

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
    return (
      errorFallback ?? (
        <div className={`${className} protected-asset-shell`.trim()}>
          <strong>Image unavailable</strong>
        </div>
      )
    );
  }

  return <img className={className} src={assetUrl} alt={alt} />;
}

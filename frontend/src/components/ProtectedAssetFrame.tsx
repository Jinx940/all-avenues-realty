import type { ReactNode } from 'react';
import { useProtectedAssetUrl } from '../lib/protectedAsset';

export function ProtectedAssetFrame({
  src,
  title,
  className,
  mimeType,
  loadingFallback,
  errorFallback,
}: {
  src: string | null;
  title: string;
  className: string;
  mimeType?: string;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode | ((message: string) => ReactNode);
}) {
  const { assetUrl, isLoading, error } = useProtectedAssetUrl(src, mimeType);

  if (isLoading) {
    return (
      loadingFallback ?? (
        <div className={`${className} protected-asset-shell`.trim()}>
          <strong>Loading file...</strong>
        </div>
      )
    );
  }

  if (!assetUrl || error) {
    const errorMessage = error || 'Could not load the protected file.';
    return (
      (typeof errorFallback === 'function' ? errorFallback(errorMessage) : errorFallback) ?? (
        <div className={`${className} protected-asset-shell`.trim()}>
          <strong>File unavailable</strong>
          <span>{errorMessage}</span>
        </div>
      )
    );
  }

  return <iframe className={className} src={assetUrl} title={title} />;
}

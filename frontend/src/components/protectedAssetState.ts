import { useCallback, useState } from 'react';

export type ProtectedAssetLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type ProtectedAssetDimensions = { width: number; height: number };

type TrackedProtectedAssetValue<TValue> = {
  assetId: string;
  value: TValue;
};

const sameProtectedAssetDimensions = (
  currentDimensions: ProtectedAssetDimensions | null,
  nextDimensions: ProtectedAssetDimensions | null,
) =>
  currentDimensions?.width === nextDimensions?.width &&
  currentDimensions?.height === nextDimensions?.height;

export const useProtectedAssetRenderState = (assetId: string, hasAsset: boolean) => {
  const [trackedLoadState, setTrackedLoadState] = useState<
    TrackedProtectedAssetValue<ProtectedAssetLoadState>
  >({
    assetId: '',
    value: 'idle',
  });
  const [trackedDimensions, setTrackedDimensions] = useState<
    TrackedProtectedAssetValue<ProtectedAssetDimensions | null>
  >({
    assetId: '',
    value: null,
  });

  const loadState =
    trackedLoadState.assetId === assetId ? trackedLoadState.value : hasAsset ? 'loading' : 'idle';
  const dimensions = trackedDimensions.assetId === assetId ? trackedDimensions.value : null;

  const handleStateChange = useCallback(
    (nextState: ProtectedAssetLoadState) => {
      setTrackedLoadState((currentState) => {
        if (currentState.assetId === assetId && currentState.value === nextState) {
          return currentState;
        }

        return {
          assetId,
          value: nextState,
        };
      });
    },
    [assetId],
  );

  const handleDimensionsChange = useCallback(
    (nextDimensions: ProtectedAssetDimensions | null) => {
      setTrackedDimensions((currentState) => {
        if (
          currentState.assetId === assetId &&
          sameProtectedAssetDimensions(currentState.value, nextDimensions)
        ) {
          return currentState;
        }

        return {
          assetId,
          value: nextDimensions,
        };
      });
    },
    [assetId],
  );

  return {
    loadState,
    dimensions,
    handleStateChange,
    handleDimensionsChange,
  };
};

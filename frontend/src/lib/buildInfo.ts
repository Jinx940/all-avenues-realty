export type AppBuildInfo = {
  version: string;
  commit: string;
  branch: string;
  builtAt: string;
};

const fallbackBuildInfo: AppBuildInfo = {
  version: '0.1.0',
  commit: import.meta.env.DEV ? 'local' : 'unknown',
  branch: import.meta.env.DEV ? 'local' : 'unknown',
  builtAt: '',
};

export const appBuildInfo: AppBuildInfo =
  typeof __APP_BUILD_INFO__ !== 'undefined' ? __APP_BUILD_INFO__ : fallbackBuildInfo;

const shortCommit = (commit: string) => {
  const normalized = commit.trim();
  if (!normalized || normalized === 'local' || normalized === 'unknown') {
    return normalized || 'unknown';
  }

  return normalized.slice(0, 7);
};

export const buildInfoSummary = (buildInfo: AppBuildInfo) =>
  `Build v${buildInfo.version} · ${shortCommit(buildInfo.commit)}`;

export const buildInfoTooltip = (buildInfo: AppBuildInfo) =>
  [
    `Version ${buildInfo.version}`,
    `Commit ${buildInfo.commit || 'unknown'}`,
    `Branch ${buildInfo.branch || 'unknown'}`,
    buildInfo.builtAt ? `Built ${buildInfo.builtAt}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

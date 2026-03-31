export const buildInfo = {
  version: process.env.npm_package_version ?? '0.1.0',
  commit:
    process.env.RENDER_GIT_COMMIT ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_VERSION ??
    'local',
  branch:
    process.env.RENDER_GIT_BRANCH ??
    process.env.GITHUB_REF_NAME ??
    process.env.BRANCH ??
    'local',
};

export const buildSummary = () =>
  `v${buildInfo.version} (${buildInfo.commit.slice(0, 7)}) on ${buildInfo.branch}`;

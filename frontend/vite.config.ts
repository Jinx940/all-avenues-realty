import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const workspacePackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version?: string }

const buildInfo = {
  version: workspacePackage.version ?? '0.1.0',
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
  builtAt: new Date().toISOString(),
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})

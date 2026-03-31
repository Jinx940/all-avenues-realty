/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_BUILD_INFO__: {
  version: string;
  commit: string;
  branch: string;
  builtAt: string;
};

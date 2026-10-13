/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SHOW_DEMO_LOGINS?: string;
  readonly VITE_ALLOW_SIMULATED_CAMERA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

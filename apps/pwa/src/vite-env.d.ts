/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "virtual:pwa-register" {
  export function registerSW(options?: {
    immediate?: boolean;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onOfflineReady?: () => void;
    onNeedRefresh?: () => void;
    onRegisterError?: (error: Error) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** Comma-separated root domains the app is served from, e.g. "fitconnect.co.in,fitconnect.app". */
  readonly VITE_APP_ROOT_DOMAINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

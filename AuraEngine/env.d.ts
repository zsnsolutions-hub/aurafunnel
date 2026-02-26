/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_TRACKING_DOMAIN: string;
  readonly VITE_SUPPORT_MODE_ENABLED?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

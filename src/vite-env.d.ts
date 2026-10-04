/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

/** Versão do app ("1.0.N", N = número da publicação) e commit, definidos no build (vite.config.ts). */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}

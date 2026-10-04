import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Versão mostrada no app ("beta v1.0.N"): N é o número da publicação no GitHub
// Actions (sobe a cada push na main). Localmente, "dev".
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? 'dev'
let commit = 'local'
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // sem git (raro): fica "local"
}

// https://vite.dev/config/
export default defineConfig({
  base: '/nutri-web-app/',
  define: {
    __APP_VERSION__: JSON.stringify(`1.0.${buildNumber}`),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon.svg'],
      // Notificações (push e toque na notificação): public/push-sw.js.
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: 'Nutriê',
        short_name: 'Nutriê',
        description: 'Acompanhe seu plano alimentar e sua ingestão de água no dia a dia.',
        lang: 'pt-BR',
        start_url: '/nutri-web-app/',
        scope: '/nutri-web-app/',
        display: 'standalone',
        background_color: '#104030',
        theme_color: '#104030',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})

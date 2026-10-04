import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/nutri-web-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon.svg'],
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

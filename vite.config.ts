/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages publica el sitio en https://<usuario>.github.io/<repositorio>/
const REPO = 'anjamap'
const base = process.env.VITE_BASE ?? `/${REPO}/`

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // La nueva versión se instala solo cuando el usuario pulsa "Actualizar".
      // El service worker solo cachea los archivos de la app; los mapas van en su propia caché (src/map/tiles.ts).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'splash/*.png'],
      manifest: {
        id: base,
        name: 'Anjamap · Bancales',
        short_name: 'Anjamap',
        description: 'Guarda lugares con fotos, compártelos y calcula cómo llegar.',
        lang: 'es',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f1eee5',
        theme_color: '#f1eee5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,webmanifest,json}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

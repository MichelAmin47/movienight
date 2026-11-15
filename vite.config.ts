import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The app is served from https://michelamin47.github.io/movienight/.
// Another PWA lives on the same origin, so the manifest (id, start_url, scope)
// and the service worker must stay inside this path and never claim the root.
const base = '/movienight/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new service worker takes over at once (skipWaiting + clientsClaim
      // below); the page then offers a reload instead of reloading by itself,
      // see src/lib/pwa.ts.
      registerType: 'autoUpdate',
      // Registered from src/lib/pwa.ts.
      injectRegister: false,
      scope: base,
      // The icons are already matched by globPatterns.
      includeManifestIcons: false,
      manifest: {
        name: 'Filmavond',
        short_name: 'Filmavond',
        description: 'Samen films kijken, samen sterren geven.',
        lang: 'nl',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        // The light canvas; dark mode is handled by the theme-color metas in index.html.
        theme_color: '#fbf7f1',
        background_color: '#fbf7f1',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell. Offline, every navigation gets the precached index.html
        // and the app itself shows the "no connection" screen.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        skipWaiting: true,
        // Only claims pages inside the registration scope, so only /movienight/.
        clientsClaim: true,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Supabase (database, auth, storage, Edge Functions) deliberately has no
        // route here: requests without a route never touch a cache.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://image.tmdb.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'filmavond-tmdb-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              // Posters are plain <img> requests, so the responses are opaque (status 0).
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.GITHUB_PAGES === 'true' ? '/matchhunter/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MatchHunter',
        short_name: 'MatchHunter',
        description: 'שידוך חכם לישראל, ירושלים והגדה',
        theme_color: '#6f2d2d',
        background_color: '#f4ebe0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        lang: 'he',
        dir: 'rtl',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})

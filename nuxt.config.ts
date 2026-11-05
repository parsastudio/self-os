import tailwindcss from '@tailwindcss/vite';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,

  modules: ['@vite-pwa/nuxt'],

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()]
  },

  runtimeConfig: {
    public: {
      appVersion: '0.0.1'
    }
  },

  nitro: {
    experimental: {
      openAPI: false
    }
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'fa',
        dir: 'rtl'
      },
      title: 'ردیابی طرح‌ها و سیستم عامل فردی',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#171b26' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/favicon.svg' },
        { rel: 'preload', href: '/Vazirmatn.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' }
      ],
      script: [
        {
          innerHTML: `(function(){try{var s=localStorage.getItem('newlife_theme');var d=s?s==='dark':true;var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`
        }
      ]
    }
  },

  pwa: {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    manifestFilename: 'manifest.webmanifest',
    includeAssets: ['favicon.svg', 'Vazirmatn.woff2'],
    manifest: {
      name: 'ردیابی طرح‌ها و سیستم عامل فردی',
      short_name: 'طرح‌های من',
      description: 'سیستم عامل فردی، ردیابی طرح‌ها، تقویم جلالی و آرشیو شخصی با عملکرد کامل آفلاین',
      lang: 'fa',
      dir: 'rtl',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#171b26',
      theme_color: '#171b26',
      icons: [
        {
          src: '/favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
    },
    client: {
      installPrompt: false,
      periodicSyncForUpdates: 1800
    },
    devOptions: {
      enabled: false
    }
  }
});

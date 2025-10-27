import './consoleFileMakerBridge.js'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

/* import font awesome icon component */
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

/* import specific icons */
import { faArrowsSpin, faArrowsRotate } from '@fortawesome/free-solid-svg-icons'

/* add icons to the library */
library.add(faArrowsSpin, faArrowsRotate)

const app = createApp(App)

app.use(createPinia())
app.component('font-awesome-icon', FontAwesomeIcon) // Register component globally

app.mount('#app')

// Register service worker for offline support (progressive enhancement)
// Disable in dev/non-HTTPS contexts (e.g., Vite localhost, FileMaker WebViewer) and remove old SWs
if ('serviceWorker' in navigator) {
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const isSecure = window.location.protocol === 'https:'
  const shouldDisableSW = isDev || !isSecure || window.location.hostname === 'localhost'

  if (shouldDisableSW) {
    // Unregister all existing service workers and clear app caches so dev changes reflect immediately
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
    if (window.caches && typeof window.caches.keys === 'function') {
      window.caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key && key.startsWith('websync-')) window.caches.delete(key)
        })
      })
    }
    console.log('[App] Service Worker disabled for dev/non-HTTPS context; caches cleared')
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[App] Service Worker registered successfully:', registration.scope)

          // Check for updates periodically
          setInterval(() => {
            registration.update()
          }, 60000) // Check every minute

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[App] New service worker available - reload to update')
                }
              })
            }
          })
        })
        .catch((error) => {
          console.log('[App] Service Worker registration failed:', error.message)
        })
    })
  }
} else {
  console.log('[App] Service Worker not supported in this context (FileMaker WebViewer mode)')
}

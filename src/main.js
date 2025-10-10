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
// This will fail gracefully in FileMaker WebViewer or other non-HTTPS contexts
if ('serviceWorker' in navigator) {
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
                // Optionally: show a notification to user to reload
              }
            })
          }
        })
      })
      .catch((error) => {
        console.log(
          '[App] Service Worker registration not available (FileMaker/file:// mode):',
          error.message,
        )
        // This is expected in FileMaker WebViewer - app continues working normally
      })
  })
} else {
  console.log('[App] Service Worker not supported in this context (FileMaker WebViewer mode)')
  // App works fine without service worker - Firestore offline cache still functions
}

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

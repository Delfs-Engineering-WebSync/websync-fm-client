import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

/* import font awesome icon component */
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

/* import specific icons */
import { faUserSecret } from '@fortawesome/free-solid-svg-icons' // Example icon

/* add icons to the library */
library.add(faUserSecret) // Add more icons here as needed

const app = createApp(App)

app.use(createPinia())
app.component('font-awesome-icon', FontAwesomeIcon) // Register component globally

app.mount('#app')

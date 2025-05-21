<script setup>
import HelloWorld from './components/HelloWorld.vue'
import TheWelcome from './components/TheWelcome.vue'
import { useAppConfigStore } from './stores/appConfig'
import { initializeFirebaseServices } from './firebaseInit'
import { onMounted } from 'vue'

const appConfig = useAppConfigStore()

onMounted(async () => {
  appConfig.initializeConfigFromURLParams()
  await initializeFirebaseServices()
})
</script>

<template>
  <header class="bg-blue-100 p-4">
    <img alt="Vue logo" class="logo" src="./assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="You did it!" />
      <p class="text-white">
        <font-awesome-icon :icon="['fas', 'user-secret']" /> Test Icon
      </p>
      <div class="text-xs text-white mt-2">
        <p>Org ID: {{ appConfig.organization.id }}</p>
        <p>Device ID: {{ appConfig.device.id }}</p>
        <p>Device Mode: {{ appConfig.device.deviceMode }}</p>
        <p>Contexts: {{ appConfig.device.contexts.join(', ') }}</p>
        <p>Is Processing: {{ appConfig.isProcessing }}</p>
      </div>
    </div>
  </header>

  <main>
    <TheWelcome />
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>

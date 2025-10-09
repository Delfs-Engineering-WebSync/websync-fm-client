<script setup>
import { useAppConfigStore } from './stores/appConfig'
import { initializeFirebaseServices, goFirestoreOffline, goFirestoreOnline } from './firebaseInit'
import { fmBridgit } from './fileMakerBridge'
import './utils/betterFormsUtils' // Initialize BF utilities globally
import { onMounted, ref, computed, watch, onUnmounted } from 'vue'

const appConfig = useAppConfigStore()
const firebaseStatus = ref('Initializing...')
const showDebugControls = ref(false)
const isOnline = ref(navigator.onLine)
const isFirestoreOffline = ref(false)
let fmStatusIntervalId = null

// Debounce: only show "System Up to Date" after 1s of inactivity
const showUpdatesIdleState = ref(true)
let updatesIdleTimer = null
const updatesActivity = computed(() => {
  return appConfig.updatesTotal > 0 || appConfig.updateTotalContainers > 0
})
watch(
  updatesActivity,
  (isActive) => {
    if (updatesIdleTimer) clearTimeout(updatesIdleTimer)
    if (isActive) {
      showUpdatesIdleState.value = false
    } else {
      updatesIdleTimer = setTimeout(() => {
        showUpdatesIdleState.value = true
      }, 1000)
    }
  },
  { immediate: true }
)

// Computed properties for progress calculations
const editsProgress = computed(() => {
  if (!appConfig.editsContainersTotal) return 0
  return Math.round((appConfig.editsContainersComplete / appConfig.editsContainersTotal) * 100)
})

const updatesProgress = computed(() => {
  if (!appConfig.updatesTotal) return 0
  return Math.round((appConfig.updatesTotalCompleted / appConfig.updatesTotal) * 100)
})

const updatesContainersProgress = computed(() => {
  if (!appConfig.updateTotalContainers) return 0
  return Math.round((appConfig.updateCompletedContainers / appConfig.updateTotalContainers) * 100)
})

// Session-based upload progress (monotonic within a run)
const sessionUploadTotal = computed(() => {
  return appConfig.sessionUpload?.active && appConfig.sessionUpload.total > 0
    ? appConfig.sessionUpload.total
    : appConfig.editsTotal
})

const sessionUploadCompleted = computed(() => {
  if (appConfig.sessionUpload?.active) {
    const delta = appConfig.editsTotalCompleted - (appConfig.sessionUpload.baselineCompleted || 0)
    return Math.max(0, delta)
  }
  return appConfig.editsTotalCompleted
})

const sessionUploadPercent = computed(() => {
  const total = sessionUploadTotal.value
  if (!total) return 0
  return Math.round((sessionUploadCompleted.value / total) * 100)
})

// Last session display values when no active session
const lastSessionCompleted = computed(() => appConfig.sessionUpload?.lastCompleted || 0)
const lastSessionTotal = computed(() => appConfig.sessionUpload?.lastTotal || 0)

// Unified display values for the KPI so it never disappears
const uploadedKpiCompleted = computed(() => {
  return sessionUploadTotal.value ? sessionUploadCompleted.value : lastSessionCompleted.value
})
const uploadedKpiTotal = computed(() => {
  return sessionUploadTotal.value ? sessionUploadTotal.value : lastSessionTotal.value
})

// Session lifecycle is started explicitly by user actions; no auto-start tied to settings

// Status computed properties
const connectionStatus = computed(() => {
  if (!isOnline.value || isFirestoreOffline.value) return 'offline'
  if (firebaseStatus.value.includes('successfully')) return 'connected'
  if (firebaseStatus.value.includes('error')) return 'error'
  return 'connecting'
})

const systemStatus = computed(() => {
  if (appConfig.isProcessing) return 'processing'
  if (appConfig.updatesTotal > 0 || appConfig.editsContainersTotal > 0) return 'syncing'
  return 'idle'
})

// Auto-pull FM edits when enabled and pending exist (runs regardless of online/offline)
const tryAutoPullEdits = async (why = 'watcher') => {
  try {
    if (!appConfig.configx.autoPullEdits) return
    if (!(appConfig.fmPendingEdits > 0)) return
    // Trigger FM to start sync; FM should push payload via web viewer callback to webSyncReceivePayload
    fmBridgit.performScript('Start Sync', JSON.stringify({ source: 'WebApp', mode: 'auto', why }), {
      fireAndForget: true,
    })
  } catch (e) {
    /* non-fatal */
  }
}

onMounted(async () => {
  try {
    // Initialize BetterForms utilities (global BF object)
    console.log('BetterForms utilities initialized:', typeof window.BF !== 'undefined' ? 'BF available globally' : 'BF not found')

    // Initialize FileMaker bridge (equivalent to BetterForms FM Bridgit setup)
    console.log('FileMaker Bridge initialized:', fmBridgit.isFileMakerEnvironment ? 'FileMaker detected' : 'Standalone mode')

    appConfig.initializeConfigFromURLParams()
    await initializeFirebaseServices()
    firebaseStatus.value = 'Connected successfully'
  } catch (error) {
    firebaseStatus.value = `Connection failed: ${error.message}`
    console.error('Firebase initialization error:', error)
  }

  // Set up network connectivity monitoring
  window.addEventListener('online', () => {
    isOnline.value = true
    console.log('Network: Online')
    tryAutoPullEdits('online')
  })

  window.addEventListener('offline', () => {
    isOnline.value = false
    console.log('Network: Offline')
  })

  // Apply persisted Firestore offline preference
  try {
    const persisted = localStorage.getItem('ws-firestore-offline')
    if (persisted === '1') {
      await goFirestoreOffline()
      isFirestoreOffline.value = true
      console.log('Persisted Firestore offline mode applied.')
    }
  } catch (e) {
    console.warn('Could not apply persisted Firestore offline mode', e)
  }

  // Start periodic FileMaker status polling for pending edits
  try {
    const pollMs = appConfig.fmStatusPollingMs || 15000
    const scriptName = appConfig.fmStatusScriptName || 'API - Web Sync Status'
    const doPoll = async () => {
      try {
        const res = await fmBridgit.performScript(
          scriptName,
          JSON.stringify({ action: 'status', what: 'pendingEdits' }),
        )
        let pending = 0
        if (typeof res === 'number') pending = res
        else if (typeof res === 'string') {
          try {
            const obj = JSON.parse(res)
            pending = Number(obj?.pendingEdits ?? obj?.count ?? 0)
          } catch {
            const asInt = parseInt(res, 10)
            if (!isNaN(asInt)) pending = asInt
          }
        } else if (typeof res === 'object' && res) {
          pending = Number(res.pendingEdits ?? res.count ?? 0)
        }
        if (!Number.isFinite(pending) || pending < 0) pending = 0
        appConfig.fmPendingEdits = pending
        // If there are pending edits and auto-pull is on, trigger sync
        tryAutoPullEdits('poll')
        appConfig.lastFmStatusAt = new Date().toISOString()
      } catch {
        /* Non-fatal; ignore and retain previous value */
      }
    }
    // initial and interval
    doPoll()
    fmStatusIntervalId = setInterval(doPoll, pollMs)
  } catch {
    /* no-op */
  }
})

onUnmounted(() => {
  if (fmStatusIntervalId) {
    clearInterval(fmStatusIntervalId)
    fmStatusIntervalId = null
  }
})

// Firestore network controls for debug modal
const setFirestoreOffline = async () => {
  try {
    await goFirestoreOffline()
    isFirestoreOffline.value = true
    localStorage.setItem('ws-firestore-offline', '1')
  } catch (e) {
    console.error('Failed to disable Firestore network', e)
  }
}

const setFirestoreOnline = async () => {
  try {
    await goFirestoreOnline()
    isFirestoreOffline.value = false
    localStorage.setItem('ws-firestore-offline', '0')
  } catch (e) {
    console.error('Failed to enable Firestore network', e)
  }
}

// Quick Actions — placeholder handlers that will later run FileMaker scripts
const openWebSyncConfig = async () => {
  console.log('Quick Action: Open WebSync Config')
  try {
    await fmBridgit.performScript('Open WebSync Config', JSON.stringify({ source: 'WebApp' }), {
      fireAndForget: true,
    })
  } catch (error) {
    console.error('WebSync Config script error:', error)
  }
}

const openWebSyncEdits = async () => {
  console.log('Quick Action: Open WebSync Edits')
  try {
    await fmBridgit.performScript('Open Edits', JSON.stringify({ source: 'WebApp' }), {
      fireAndForget: true,
    })
  } catch (error) {
    console.error('WebSync Edits script error:', error)
  }
}

const runWebSyncNow = async () => {
  console.log('Quick Action: Run Sync Now')
  try {
    await fmBridgit.performScript('Start Sync', JSON.stringify({ source: 'WebApp' }), {
      fireAndForget: true,
    })
  } catch (error) {
    console.error('Run Sync script error:', error)
  }
}

/* Removed development-only test helpers */
</script>

<template>
  <div class="min-h-screen w-full bg-gray-900 text-gray-100 overflow-x-auto">

    <!-- TOP NAVIGATION BAR -->
    <nav class="w-full bg-gray-800 border-b border-gray-700 sticky top-0 z-30">
      <div class="px-0 py-3">
        <div class="flex items-center justify-between px-3 sm:px-4 max-w-screen-2xl mx-auto">
          <!-- Logo/Brand -->
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-3">
              <div class="p-2 bg-blue-600 rounded-lg">
                <font-awesome-icon :icon="['fas', 'arrows-rotate']"
                  :class="appConfig.isProcessing ? 'animate-spin' : ''" class="text-white text-lg" />
              </div>
              <div>
                <h1 class="text-lg font-bold text-white">WebSync</h1>
                <p class="text-xs text-gray-400">Dashboard</p>
              </div>
            </div>
          </div>


          <!-- Status Indicators -->
          <div class="flex items-center space-x-6">
            <!-- Connection Status -->
            <div class="flex items-center space-x-3">
              <div :class="{
                'bg-green-500': connectionStatus === 'connected',
                'bg-red-500': connectionStatus === 'error' || connectionStatus === 'offline',
                'bg-yellow-500': connectionStatus === 'connecting'
              }" class="w-3 h-3 rounded-full"></div>
              <span class="text-sm text-gray-300 font-medium">
                {{
                  connectionStatus === 'connected' ? 'Connected' :
                    connectionStatus === 'offline' ? 'Offline' :
                      connectionStatus === 'error' ? 'Error' :
                        'Connecting'
                }}
              </span>
            </div>

            <!-- System Status -->
            <div v-if="systemStatus !== 'idle'" class="flex items-center space-x-3">
              <div :class="{
                'bg-blue-500': systemStatus === 'processing',
                'bg-purple-500': systemStatus === 'syncing',
                'bg-gray-500': systemStatus === 'idle'
              }" class="w-3 h-3 rounded-full"></div>
              <span class="text-sm text-gray-300 font-medium capitalize">{{ systemStatus }}</span>
            </div>

            <!-- Secondary Actions: Config + Edits -->
            <div class="hidden md:flex items-center space-x-2">
              <button @click="openWebSyncConfig"
                class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700/70 bg-transparent hover:bg-gray-700/40 text-gray-300 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                aria-label="Open WebSync Config" title="Open WebSync Config">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span class="text-xs font-medium">webSync Config</span>
              </button>

              <button @click="openWebSyncEdits"
                class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700/70 bg-transparent hover:bg-gray-700/40 text-gray-300 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                aria-label="Open WebSync Edits" title="Open WebSync Edits">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
                <span class="text-xs font-medium">WebSync Edits</span>
              </button>
            </div>

            <!-- Debug Toggle -->
            <button @click="showDebugControls = !showDebugControls"
              class="p-3 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors"
              title="Debug Controls">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                </path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </button>

            <!-- Primary Sync Button at far right -->
            <button @click="runWebSyncNow"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Run Sync" title="Run Sync">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 10-6.219 8.56" />
                <path d="M22 12l-3-3-3 3" />
              </svg>
              <span class="text-xs">Sync</span>
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- MAIN DASHBOARD CONTENT -->
    <div class="w-full pb-4 px-2 sm:px-0">



      <!-- SYNC OPERATIONS SECTION -->
      <div class="px-0 py-4">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 px-3 sm:px-4 max-w-screen-2xl mx-auto">

          <!-- COMBINED DEVICE + ORG CARD (compact) -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 min-w-0 lg:col-span-2">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center space-x-2">
                <div class="p-2 bg-indigo-600 bg-opacity-20 rounded-lg">
                  <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 class="text-lg font-bold text-white">Device</h2>
                  <p class="text-xs text-gray-400">Configuration</p>
                </div>
              </div>
            </div>
            <div class="space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Device:</span>
                <span class="text-white font-mono">{{ appConfig.device.id }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Mode:</span>
                <span class="px-2 py-0.5 bg-gray-700 rounded text-[10px] text-white font-medium">{{
                  appConfig.device.deviceMode }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Org:</span>
                <span class="text-white font-mono">{{ appConfig.organization.id }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Contexts:</span>
                <span class="text-white">{{ appConfig.device.contexts.length }}</span>
              </div>
            </div>
          </div>

          <!-- EDITS PANEL -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 min-w-0 lg:col-span-5">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center space-x-3">
                <div class="p-2 bg-blue-600 bg-opacity-20 rounded-lg">
                  <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h2 class="text-lg font-bold text-white">Data Uploads</h2>
                    <span
                      class="px-2 py-1 bg-blue-600 bg-opacity-20 rounded-full text-xs font-semibold text-blue-400 uppercase tracking-wide">EDITS</span>
                  </div>
                  <p class="text-xs text-gray-400">Local to WebSync</p>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <p class="text-sm text-gray-300">
                {{ !isOnline ? 'Waiting for connectivity — uploads will resume automatically' : (sessionUploadTotal ?
                  'Uploading Edits' : appConfig.editsStates[appConfig.editsCurrentState]) }}
              </p>
            </div>

            <!-- Status snapshot: FM pending, Local unsynced, Uploaded this session -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mb-2">
              <div class="flex items-center justify-between text-gray-400">
                <span>FM pending edits</span>
                <span class="text-white font-medium">{{ appConfig.fmPendingEdits }}</span>
              </div>
              <div class="flex items-center justify-between text-gray-400">
                <span>Local unsynced</span>
                <span class="text-white font-medium">{{ appConfig.editsLocalPendingWrites }}</span>
              </div>
              <div class="flex items-center justify-between text-gray-400">
                <span>Uploaded (session)</span>
                <span class="text-white font-medium">{{ uploadedKpiCompleted }} / {{ uploadedKpiTotal }}</span>
              </div>
            </div>

            <div v-if="appConfig.editsTotal || appConfig.editsContainersTotal" class="space-y-4">
              <!-- Uploading Progress (Edits Records) -->
              <div v-if="sessionUploadTotal" class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-300 text-sm">Edits Upload Progress</span>
                  <span class="text-blue-400 font-bold text-sm">{{ sessionUploadPercent }}%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-blue-500 to-blue-400 h-1.5 rounded-full transition-all duration-700 ease-out"
                    :style="`width: ${Math.min(sessionUploadPercent, 100)}%`">
                  </div>
                </div>
                <div class="flex justify-between text-xs text-gray-400">
                  <span>{{ sessionUploadCompleted }} completed</span>
                  <span>{{ sessionUploadTotal }} total</span>
                </div>
              </div>

              <!-- Uploading Progress (Containers) -->
              <div v-if="appConfig.editsContainersTotal" class="border-t border-gray-700 pt-3 space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-300 text-sm">Container Upload Progress</span>
                  <span class="text-blue-400 font-bold text-sm">{{ editsProgress }}%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-blue-500 to-blue-400 h-1.5 rounded-full transition-all duration-700 ease-out"
                    :style="`width: ${Math.min(editsProgress, 100)}%`"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-400">
                  <span>{{ appConfig.editsContainersComplete }} completed</span>
                  <span>{{ appConfig.editsContainersTotal }} total</span>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-4 text-gray-500">
              <svg class="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <p class="text-sm">No pending uploads</p>
              <p class="text-xs text-gray-400 invisible">placeholder</p>
            </div>
          </div>

          <!-- UPDATES PANEL -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 min-w-0 lg:col-span-5">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center space-x-3">
                <div class="p-2 bg-green-600 bg-opacity-20 rounded-lg">
                  <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z">
                    </path>
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h2 class="text-lg font-bold text-white">Data Downloads</h2>
                    <span
                      class="px-2 py-1 bg-green-600 bg-opacity-20 rounded-full text-xs font-semibold text-green-400 uppercase tracking-wide">UPDATES</span>
                  </div>
                  <p class="text-xs text-gray-400">WebSync to Local</p>
                </div>
              </div>
            </div>

            <!-- Status line to mirror the uploads panel spacing -->
            <div class="mb-3">
              <p class="text-sm text-gray-300">
                {{ appConfig.updatesTotal ? 'Receiving Updates' : 'No New Updates' }}
              </p>
            </div>

            <div v-if="appConfig.updatesTotal" class="space-y-4">
              <!-- Main Updates Progress -->
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-300 text-sm">Download Progress</span>
                  <span class="text-green-400 font-bold text-sm">{{ updatesProgress }}%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-green-500 to-green-400 h-1.5 rounded-full transition-all duration-700 ease-out"
                    :style="`width: ${Math.min(updatesProgress, 100)}%`"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-400">
                  <span>{{ appConfig.updatesTotalCompleted }} completed</span>
                  <span>{{ appConfig.updatesTotal }} total</span>
                </div>
              </div>

              <!-- Container Downloads -->
              <div v-if="appConfig.updateTotalContainers" class="border-t border-gray-700 pt-3 space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-300 text-sm">Container Downloads</span>
                  <span class="text-green-400 font-bold text-sm">{{ updatesContainersProgress }}%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-green-500 to-green-400 h-1.5 rounded-full transition-all duration-700 ease-out"
                    :style="`width: ${Math.min(updatesContainersProgress, 100)}%`"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-400">
                  <span>{{ appConfig.updateCompletedContainers }} completed</span>
                  <span>{{ appConfig.updateTotalContainers }} total</span>
                </div>
              </div>
            </div>

            <div v-else-if="showUpdatesIdleState" class="text-center py-4">
              <svg class="w-8 h-8 mx-auto mb-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <p class="text-green-400 font-semibold text-sm">System Up to Date</p>
              <p class="text-xs text-gray-400">All data synchronized</p>
            </div>
            <div v-else class="text-center py-4 text-gray-500">
              <p class="text-xs invisible">placeholder</p>
            </div>
          </div>

        </div>
      </div>



    </div>

    <!-- DEBUG PANEL OVERLAY -->
    <div v-if="showDebugControls"
      class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center p-4 overflow-y-auto"
      @click="showDebugControls = false">
      <div class="bg-gray-800 border border-gray-700 rounded-2xl p-8 w-full max-w-lg my-8" @click.stop>
        <div class="flex items-center justify-between mb-8">
          <h3 class="text-xl font-bold text-white">Developer Debugging Controls</h3>
          <button @click="showDebugControls = false" class="text-gray-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Firestore Network Controls -->
        <div class="mb-8">
          <h4 class="text-sm font-semibold text-white mb-4">Firestore Network</h4>
          <div class="flex items-center justify-between mb-4">
            <span class="text-gray-400">Mode:</span>
            <span :class="isFirestoreOffline ? 'text-red-400' : 'text-green-400'" class="font-semibold">
              {{ isFirestoreOffline ? 'Offline (network disabled)' : 'Online' }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <button @click="setFirestoreOffline"
              class="bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-xl font-medium transition-colors">
              Go Offline
            </button>
            <button @click="setFirestoreOnline"
              class="bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-medium transition-colors">
              Go Online
            </button>
          </div>
        </div>

        <!-- Upload Settings -->
        <div class="mb-8">
          <h4 class="text-sm font-semibold text-white mb-4">Upload Settings</h4>
          <div class="flex items-center justify-between">
            <span class="text-gray-400"
              title="When enabled, new FileMaker edits are auto-imported to local Firestore when online; if offline, they import on reconnect.">Auto
              pull edits to local</span>
            <label class="inline-flex items-center gap-3">
              <input type="checkbox" :checked="appConfig.configx.autoPullEdits"
                @change="(e) => { appConfig.setAutoPullEdits(e.target.checked); if (e.target.checked) tryAutoPullEdits('toggle'); }"
                class="w-5 h-5 rounded border-gray-600 bg-gray-700" />
              <span class="text-xs text-gray-400">URL param overrides and is saved</span>
            </label>
          </div>
        </div>

        <!-- Progress Simulation -->
        <div class="mb-8">
          <h4 class="text-sm font-semibold text-white mb-4">Simulate Progress</h4>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-gray-400 text-sm">Edits:</label>
              <div class="flex items-center space-x-2">
                <input v-model.number="appConfig.editsTotalCompleted" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
                <span class="text-gray-500">/</span>
                <input v-model.number="appConfig.editsTotal" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <label class="text-gray-400 text-sm">Upload Containers:</label>
              <div class="flex items-center space-x-2">
                <input v-model.number="appConfig.editsContainersComplete" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
                <span class="text-gray-500">/</span>
                <input v-model.number="appConfig.editsContainersTotal" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <label class="text-gray-400 text-sm">Updates:</label>
              <div class="flex items-center space-x-2">
                <input v-model.number="appConfig.updatesTotalCompleted" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
                <span class="text-gray-500">/</span>
                <input v-model.number="appConfig.updatesTotal" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <label class="text-gray-400 text-sm">Containers:</label>
              <div class="flex items-center space-x-2">
                <input v-model.number="appConfig.updateCompletedContainers" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
                <span class="text-gray-500">/</span>
                <input v-model.number="appConfig.updateTotalContainers" type="number"
                  class="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" min="0" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #374151;
}

::-webkit-scrollbar-thumb {
  background: #6b7280;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>

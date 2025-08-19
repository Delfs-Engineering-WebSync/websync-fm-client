<script setup>
import { useAppConfigStore } from './stores/appConfig'
import { initializeFirebaseServices } from './firebaseInit'
import { fmBridgit } from './fileMakerBridge'
import './utils/betterFormsUtils' // Initialize BF utilities globally
import { onMounted, ref, computed } from 'vue'

const appConfig = useAppConfigStore()
const firebaseStatus = ref('Initializing...')
const showDebugControls = ref(false)
const isOnline = ref(navigator.onLine)

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

// Status computed properties
const connectionStatus = computed(() => {
  if (!isOnline.value) return 'offline'
  if (firebaseStatus.value.includes('successfully')) return 'connected'
  if (firebaseStatus.value.includes('error')) return 'error'
  return 'connecting'
})

const systemStatus = computed(() => {
  if (appConfig.isProcessing) return 'processing'
  if (appConfig.updatesTotal > 0 || appConfig.editsContainersTotal > 0) return 'syncing'
  return 'idle'
})

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
  })

  window.addEventListener('offline', () => {
    isOnline.value = false
    console.log('Network: Offline')
  })
})

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

// Test methods for debug panel
const testFSUpdatesHandler = async () => {
  console.log('Testing FSUpdatesHandler...')

  // Create mock updates data
  const mockUpdates = [
    {
      id: 'test-update-1',
      _table: 'TestTable',
      _tsModFireStore: new Date(),
      _ts: {
        field1: { ts: Date.now() },
        field2: { ts: Date.now() + 1000 }
      },
      field1: 'Test Value 1',
      field2: 'Test Value 2',
      batchTotalEdits: 2,
      batchIdEdits: 'batch-123'
    },
    {
      id: 'test-update-2',
      _table: 'TestTable',
      _tsModFireStore: new Date(),
      _ts: {
        field1: { ts: Date.now() + 2000 }
      },
      field1: 'Test Value 3',
      batchTotalEdits: 2,
      batchIdEdits: 'batch-123'
    }
  ]

  const result = await window.BF.namedAction('FSUpdatesHandler', { updates: mockUpdates })
  console.log('FSUpdatesHandler result:', result)
}

const testEditsUpdateStatus = async () => {
  console.log('Testing editsUpdateStatus...')

  const result = await window.BF.namedAction('editsUpdateStatus', {
    currentState: '3',
    pendingEdits: 5
  })
  console.log('editsUpdateStatus result:', result)
}

const testContainerDownloads = async () => {
  console.log('Testing updatesContainerDownloads...')

  const result = await window.BF.namedAction('updatesContainerDownloads', {
    updates: {
      totalContainers: 10,
      completedContainers: 3
    }
  })
  console.log('updatesContainerDownloads result:', result)
}

// Test FSUpdatesHandler with active device mode
const testFSUpdatesHandlerActive = async () => {
  console.log('Testing FSUpdatesHandler in active mode...')

  // Temporarily switch to active mode
  const originalMode = appConfig.device.deviceMode
  appConfig.device.deviceMode = 'active'

  // Create mock updates data
  const mockUpdates = [
    {
      id: 'test-update-1',
      _table: 'TestTable',
      _tsModFireStore: new Date(),
      _ts: {
        field1: { ts: Date.now() },
        field2: { ts: Date.now() + 1000 }
      },
      field1: 'Test Value 1',
      field2: 'Test Value 2',
      batchTotalEdits: 2,
      batchIdEdits: 'batch-123'
    },
    {
      id: 'test-update-2',
      _table: 'TestTable',
      _tsModFireStore: new Date(),
      _ts: {
        field1: { ts: Date.now() + 2000 }
      },
      field1: 'Test Value 3',
      batchTotalEdits: 2,
      batchIdEdits: 'batch-123'
    }
  ]

  const result = await window.BF.namedAction('FSUpdatesHandler', { updates: mockUpdates })
  console.log('FSUpdatesHandler active mode result:', result)

  // Restore original mode
  appConfig.device.deviceMode = originalMode
  console.log(`Device mode restored to: ${originalMode}`)
}

// Test subscribeUpdates functionality
const testSubscribeUpdates = async () => {
  console.log('Testing subscribeUpdates...')

  const result = await window.BF.namedAction('subscribeUpdates')
  console.log('subscribeUpdates result:', result)
}

// Simulate a Firestore update for testing
const simulateFirestoreUpdate = async () => {
  console.log('Simulating Firestore update...')

  // Create a mock snapshot that mimics what Firestore would send
  const mockSnapshot = {
    empty: false,
    docChanges: () => [
      {
        type: 'added',
        doc: {
          id: 'simulated-update-' + Date.now(),
          data: () => ({
            id: 'simulated-update-' + Date.now(),
            _table: 'SimulatedTable',
            _tsModFireStore: new Date(),
            _ts: {
              field1: { ts: Date.now() * 1000 }, // Convert to microseconds like FileMaker
              field2: { ts: (Date.now() + 1000) * 1000 }
            },
            field1: 'Simulated Value 1',
            field2: 'Simulated Value 2',
            updatedKeys: ['field1', 'field2'],
            batchTotalEdits: 1,
            batchIdEdits: 'simulated-batch-' + Date.now(),
            _contexts: appConfig.device.contexts // Match device contexts
          })
        }
      }
    ]
  }

  // Directly call processSnapshot to simulate receiving an update
  if (window.processSnapshot) {
    window.processSnapshot(mockSnapshot, appConfig)
  } else {
    console.log('processSnapshot not available - this would normally be called by the Firestore listener')

    // Manually trigger FSUpdatesHandler as a fallback
    const mockUpdates = [{
      id: 'simulated-update-' + Date.now(),
      _table: 'SimulatedTable',
      _tsModFireStore: new Date(),
      _ts: {
        field1: { ts: Date.now() * 1000 },
        field2: { ts: (Date.now() + 1000) * 1000 }
      },
      field1: 'Simulated Value 1',
      field2: 'Simulated Value 2',
      batchTotalEdits: 1,
      batchIdEdits: 'simulated-batch-' + Date.now()
    }]

    // Temporarily switch to active mode for the test
    const originalMode = appConfig.device.deviceMode
    appConfig.device.deviceMode = 'active'

    const result = await window.BF.namedAction('FSUpdatesHandler', { updates: mockUpdates })
    console.log('Simulated update result:', result)

    // Restore original mode
    appConfig.device.deviceMode = originalMode
  }
}
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
            <div class="flex items-center space-x-3">
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
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 px-3 sm:px-4 max-w-screen-2xl mx-auto">

          <!-- EDITS PANEL -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 min-w-0">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center space-x-3">
                <div class="p-2 bg-blue-600 bg-opacity-20 rounded-lg">
                  <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                </div>
                <div>
                  <h2 class="text-lg font-bold text-white">Data Uploads</h2>
                  <p class="text-xs text-gray-400">Local to Cloud Sync</p>
                </div>
              </div>
              <div class="px-2 py-1 bg-blue-600 bg-opacity-20 rounded-full">
                <span class="text-xs font-semibold text-blue-400 uppercase tracking-wide">EDITS</span>
              </div>
            </div>

            <div class="mb-3">
              <p class="text-sm text-gray-300">
                {{ !appConfig.editsTotalPending ? appConfig.editsStates[appConfig.editsCurrentState] :
                  appConfig.editsStates[appConfig.editsCurrentState] + ": " + appConfig.editsTotalPending }}
              </p>
            </div>

            <!-- Uploading Progress -->
            <div v-if="appConfig.editsContainersTotal" class="space-y-3">
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
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 min-w-0">
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
                  <h2 class="text-lg font-bold text-white">Data Downloads</h2>
                  <p class="text-xs text-gray-400">Cloud to Local Sync</p>
                </div>
              </div>
              <div class="px-2 py-1 bg-green-600 bg-opacity-20 rounded-full">
                <span class="text-xs font-semibold text-green-400 uppercase tracking-wide">UPDATES</span>
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

            <div v-else class="text-center py-4">
              <svg class="w-8 h-8 mx-auto mb-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <p class="text-green-400 font-semibold text-sm">System Up to Date</p>
              <p class="text-xs text-gray-400">All data synchronized</p>
            </div>
          </div>

        </div>
      </div>

      <!-- SYSTEM OVERVIEW CARDS -->
      <div class="px-0 py-2">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 px-3 sm:px-4 max-w-screen-2xl mx-auto">
          <!-- Device Info Card -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-white">Device Info</h3>
              <div class="p-2 bg-blue-600 bg-opacity-20 rounded-lg">
                <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z">
                  </path>
                </svg>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-gray-400 text-xs">ID:</span>
                <span class="text-white font-mono text-sm">{{ appConfig.device.id }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-400 text-xs">Mode:</span>
                <span class="px-2 py-1 bg-gray-700 rounded text-xs text-white font-medium">{{
                  appConfig.device.deviceMode }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-400 text-xs">Type:</span>
                <span class="text-white text-sm">{{ appConfig.device.deviceType }}</span>
              </div>
            </div>
          </div>

          <!-- Organization Card -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-white">Organization</h3>
              <div class="p-2 bg-green-600 bg-opacity-20 rounded-lg">
                <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4">
                  </path>
                </svg>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-gray-400 text-xs">ID:</span>
                <span class="text-white font-mono text-sm">{{ appConfig.organization.id }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-400 text-xs">Contexts:</span>
                <span class="text-white text-sm">{{ appConfig.device.contexts.length }}</span>
              </div>
            </div>
          </div>

          <!-- System Status Card -->
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-white">System Status</h3>
              <div class="p-2 bg-purple-600 bg-opacity-20 rounded-lg">
                <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2-2z">
                  </path>
                </svg>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-gray-400 text-xs">Database:</span>
                <div class="flex items-center space-x-2">
                  <div :class="{
                    'bg-green-500': connectionStatus === 'connected',
                    'bg-red-500': connectionStatus === 'error' || connectionStatus === 'offline',
                    'bg-yellow-500': connectionStatus === 'connecting'
                  }" class="w-2 h-2 rounded-full"></div>
                  <span class="text-white text-xs font-medium">{{
                    connectionStatus === 'connected' ? 'Online' :
                      connectionStatus === 'offline' ? 'Offline' :
                        connectionStatus === 'error' ? 'Error' :
                          'Connecting'
                  }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-400 text-xs">Processing:</span>
                <span :class="appConfig.isProcessing ? 'text-yellow-400' : 'text-gray-400'" class="text-xs font-medium">
                  {{ appConfig.isProcessing ? 'Active' : 'Idle' }}
                </span>
              </div>
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

        <!-- Processing Controls -->
        <div class="mb-8">
          <h4 class="text-sm font-semibold text-white mb-4">Processing State</h4>
          <div class="flex items-center justify-between mb-4">
            <span class="text-gray-400">Status:</span>
            <span :class="appConfig.isProcessing ? 'text-yellow-400' : 'text-green-400'" class="font-semibold">
              {{ appConfig.isProcessing ? 'Active' : 'Idle' }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <button @click="appConfig.startProcessing()"
              class="bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors">
              Start
            </button>
            <button @click="appConfig.endProcessing()"
              class="bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-medium transition-colors">
              Stop
            </button>
          </div>
        </div>

        <!-- Progress Simulation -->
        <div class="mb-8">
          <h4 class="text-sm font-semibold text-white mb-4">Simulate Progress</h4>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-gray-400 text-sm">Edits:</label>
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

        <!-- Test Actions -->
        <div class="mb-8 border-t border-gray-700 pt-6">
          <h4 class="text-sm font-semibold text-white mb-4">Test Actions</h4>
          <div class="space-y-3">
            <button @click="testFSUpdatesHandler"
              class="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm">
              Test FSUpdatesHandler
            </button>
            <button @click="testEditsUpdateStatus"
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm">
              Test Edits Update Status
            </button>
            <button @click="testContainerDownloads"
              class="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm">
              Test Container Downloads
            </button>
            <button @click="testFSUpdatesHandlerActive"
              class="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm">
              Test FSUpdatesHandler in Active Mode
            </button>
            <button @click="testSubscribeUpdates"
              class="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm">
              Test Subscribe Updates
            </button>
            <button @click="simulateFirestoreUpdate"
              class="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm">
              Simulate Firestore Update
            </button>
          </div>
        </div>

        <!-- System Info -->
        <div class="border-t border-gray-700 pt-6">
          <h4 class="text-sm font-semibold text-white mb-3">System Info</h4>
          <div class="space-y-2 text-xs text-gray-400 font-mono">
            <div>ORG: {{ appConfig.organization.id }}</div>
            <div>DEV: {{ appConfig.device.id }} ({{ appConfig.device.deviceMode }})</div>
            <div>DB: {{ firebaseStatus }}</div>
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

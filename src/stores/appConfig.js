import { defineStore } from 'pinia'
import { getUUID } from '../utils/betterFormsUtils'

export const useAppConfigStore = defineStore('appConfig', {
  state: () => ({
    // Session management (equivalent to model.idSession)
    sessionId: getUUID(),
    // Mirroring the provided global app model structure
    activeJob: null,
    // configx will hold initial settings, some might be overridden by URL params
    configx: {
      deviceMode: 'passive', // Default, can be overridden by URL param
      deviceType: 'webApp', // Default, can be overridden by URL param
      idContext: 'CON_north', // Example default, original app might have its own default
      idDevice: null, // Will be set by URL param or defaulted to DEV_demo
      idOrganization: null, // Will be set by URL param or defaulted to ORG_demo
      tsModFireStoreLastUpdate: new Date().toISOString(), // Initialize with current date as a sensible default
    },
    device: {
      // This will be populated further, including by URL params via initializeConfig
      id: 'DEV_demo', // Default fallback like BetterForms
      deviceMode: 'passive',
      deviceType: 'webApp',
      tsModFireStoreLastUpdate: null,
      contexts: ['defaultContext'],
      tables: [], // Assuming default from your later initFirestore script
      recordID: null, // Assuming default
      lastSyncOutUTC: null, // Assuming default
      syncAppURL: null, // Assuming default
      // Other device-specific properties from your global model can be added here
    },
    editsContainersComplete: 0,
    editsContainersTotal: 0,
    editsTotalCompleted: 0,
    editsTotal: 0,
    editsCurrentState: '0',
    // New: visibility/telemetry for pending edits
    fmPendingEdits: 0, // Count of edits in FileMaker not yet pushed to Web App
    editsLocalPendingWrites: 0, // Count of local Firestore writes not yet synced to cloud
    lastFmStatusAt: null, // Timestamp of last status poll
    fmStatusScriptName: 'API - Web Sync Status', // Can be overridden if needed
    fmStatusPollingMs: 15000, // Polling cadence for FM status
    editsStates: {
      0: 'No New Edits',
      1: 'Starting Sync',
      2: 'Fetching New Edits',
      3: 'Sending Data',
      4: 'Updates Sent',
      5: 'New Edits',
    },
    editsTotalPending: 0,
    env: {
      logoURL: 'https://ucarecdn.com/cbbbcd08-c49f-499d-8125-e1dbb2a4f262/',
    },
    // firebaseConfig will be imported from a dedicated file, not kept in reactive state.
    fmUpdatesBatchSize: 25,
    isOnline: true,
    isProcessing: false, // For the isProcessing named action
    isUpdatingFM: false,
    localFSInSync: '-',
    log: '---',
    organization: {
      // This will be populated further, including by URL params
      id: 'ORG_demo', // Default fallback like BetterForms
      // Other organization-specific properties from your global model can be added here
    },
    payload: {},
    people: [],
    storageSize: 0,
    updateCompletedContainers: 0,
    updateTotalContainers: 0,
    updatesBatches: {},
    updatesCurrentTS: {},
    updatesQueue: [],
    updatesTotal: 0,
    updatesTotalCompleted: 0,
    updatesTotalRecords: 0,
  }),
  actions: {
    initializeConfigFromURLParams() {
      const getQueryParam = (param) => {
        const urlParams = new URLSearchParams(window.location.search)
        return urlParams.get(param)
      }

      console.log(
        '@onAppLoad InitConfigs - Initial device state before URL params: ',
        JSON.parse(JSON.stringify(this.device)),
      )

      const orgIdFromQuery = getQueryParam('idOrganization')
      this.organization.id = orgIdFromQuery || this.organization.id || 'ORG_demo'
      this.configx.idOrganization = this.organization.id // also update configx for consistency if needed

      const deviceIdFromQuery = getQueryParam('idDevice')
      this.device.id = deviceIdFromQuery || this.device.id || 'DEV_demo'
      this.configx.idDevice = this.device.id // also update configx

      this.device.deviceMode = getQueryParam('deviceMode') || this.device.deviceMode || 'passive'
      this.configx.deviceMode = this.device.deviceMode

      this.device.deviceType = getQueryParam('deviceType') || this.device.deviceType || 'webApp'
      this.configx.deviceType = this.device.deviceType

      if (this.device.deviceType === 'webApp') {
        const now = new Date()
        this.device.tsModFireStoreLastUpdate = now
        this.configx.tsModFireStoreLastUpdate = now.toISOString()
      }

      const contextsFromQuery = getQueryParam('contexts')
      if (contextsFromQuery) {
        try {
          const decodedContext = decodeURI(contextsFromQuery)
          const decodedToArray = decodedContext.split(',')
          this.device.contexts = decodedToArray.length > 0 ? decodedToArray : this.device.contexts
        } catch (e) {
          console.error('Error decoding contexts from URL query parameter:', e)
        }
      }
      console.log(
        'Final appConfig store state after URL params:',
        JSON.parse(JSON.stringify(this.$state)),
      )
    },

    // Actions for isProcessing state
    startProcessing() {
      this.isProcessing = true
      // If a debounce/timeout is needed to auto-revert, it could be implemented here
      // For example: setTimeout(() => { if(this.isProcessing) this.isProcessing = false; }, 5000); // Auto-revert after 5s
      console.log('isProcessing set to true')
    },
    endProcessing() {
      this.isProcessing = false
      console.log('isProcessing set to false')
    },
    // We will add more actions here as we translate other parts of your initFirestore script
  },
})

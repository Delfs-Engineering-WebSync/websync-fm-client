import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  collection,
  onSnapshot,
  setDoc,
  orderBy,
  where,
  Timestamp, // Import Timestamp for creating Firestore Timestamp objects
} from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig' // Your Firebase project credentials
import { useAppConfigStore } from './stores/appConfig'

let db = null
let firebaseApp = null

// To store unsubscribe functions for Firestore listeners
let fsOrganizationRefUnsubscribe = null
let fsDeviceRefUnsubscribe = null
let fsUpdatesRefUnsubscribe = null
let jobsRefUnsubscribe = null // For the jobs listener

// References to Firestore documents/collections, will be initialized later
let fsOrganizationDocRef = null
let fsDeviceDocRef = null
let fsUpdatesCollectionRef = null
let jobsCollectionRef = null

// Helper to simulate BF.namedAction calls if needed for logging or simple state changes
// For complex named actions, they would be refactored into proper functions/Pinia actions.
const BFNamedAction = (actionName, options) => {
  console.log(`BFNamedAction Called: ${actionName}`, options || '')
  const appConfig = useAppConfigStore() // Get store instance inside function where it's used

  if (actionName === 'isProcessing') {
    appConfig.startProcessing()
    // The original BF 'isProcessing' also had a debounce and auto-false.
    // For now, this just sets it to true. A corresponding call to endProcessing() would be needed.
    // Or, implement a timeout here if automatic clearing is desired.
    setTimeout(() => {
      // Simple auto-clear example if no explicit endProcessing is called
      if (appConfig.isProcessing) {
        // appConfig.endProcessing();
      }
    }, 3000) // Auto clear after 3s for this example
  }
  // Add more simple named action handlers here if needed for direct translation
  // Complex ones like 'FSUpdatesHandler' will be full Pinia actions.
}

async function checkParentDocuments() {
  const appConfig = useAppConfigStore()
  if (!appConfig.organization.id || !appConfig.device.id) {
    console.error('Organization ID or Device ID is missing. Cannot check/create parent documents.')
    return
  }

  try {
    console.log(`Ensuring Organization document exists: Organizations/${appConfig.organization.id}`)
    // fsOrganizationDocRef is already initialized in initializeFirebaseServices
    await setDoc(fsOrganizationDocRef, {}, { merge: true })

    console.log(
      `Ensuring Device document exists: Organizations/${appConfig.organization.id}/Devices/${appConfig.device.id}`,
    )
    // fsDeviceDocRef is already initialized in initializeFirebaseServices
    await setDoc(
      fsDeviceDocRef,
      {
        deviceType: appConfig.device.deviceType,
      },
      { merge: true },
    )
    console.log('Parent documents checked/created successfully.')
  } catch (error) {
    console.error('Error in checkParentDocuments: ', error)
  }
}

export async function initializeFirebaseServices() {
  const appConfig = useAppConfigStore()

  if (appConfig.device.deviceMode === 'passive') {
    console.log('Device mode is passive. Skipping Firebase initialization.')
    return
  }

  if (firebaseApp) {
    console.log('Firebase already initialized.')
    return // Already initialized
  }

  try {
    console.log('Initializing Firebase app...')
    firebaseApp = initializeApp(firebaseConfig)
    db = getFirestore(firebaseApp)

    console.log('Enabling Firestore offline persistence...')
    await enableIndexedDbPersistence(db)
    console.log('Firestore offline persistence enabled.')

    // Initialize document/collection references after db is initialized and config is available
    if (appConfig.organization.id && appConfig.device.id) {
      fsOrganizationDocRef = doc(db, 'Organizations', appConfig.organization.id)
      fsDeviceDocRef = doc(fsOrganizationDocRef, 'Devices', appConfig.device.id) // Uses fsOrganizationDocRef
      fsUpdatesCollectionRef = collection(fsOrganizationDocRef, 'Updates') // Uses fsOrganizationDocRef
      // jobsCollectionRef = collection(db, "jobs_dev") // Not used for now
      console.log('Firestore document/collection references initialized.')
    } else {
      console.error(
        'Organization ID or Device ID not available from config store for Firebase refs initialization.',
      )
      // Potentially throw an error or handle this state if Firebase is critical
      return // Stop further Firebase setup if essential IDs are missing
    }

    console.log('Firebase services initialized.')
    await setupFirestoreListenersAndChecks()
  } catch (error) {
    console.error('Error initializing Firebase: ', error)
  }
}

async function setupFirestoreListenersAndChecks() {
  console.log('Setting up Firestore listeners and initial checks...')
  await checkParentDocuments() // Call the new function

  // Placeholder for other functions
  // subscribeToOrganization();
  // subscribeToDevice();
  // subscribeToUpdates();

  console.log('Placeholder: More listeners and checks will be added here.')
}

// We will define subscribeOrg, subscribeDevice, processSnapshot, subscribeUpdates,
// and the jobs listener logic here incrementally.

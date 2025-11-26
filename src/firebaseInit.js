import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  enableNetwork,
  disableNetwork,
  doc,
  collection,
  setDoc,
  onSnapshot,
  getDoc
} from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig' // Your Firebase project credentials
import { useAppConfigStore } from './stores/appConfig'

let db = null
let firebaseApp = null

// To store unsubscribe functions for Firestore listeners
let fsUpdatesRefUnsubscribe = null

// References to Firestore documents/collections, will be initialized later
let fsOrganizationDocRef = null
let fsDeviceDocRef = null
let fsUpdatesCollectionRef = null
let fsEditsCollectionRef = null
let fsEditsRefUnsubscribe = null

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
    db = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache(),
    })
    try {
      console.log('Using Firebase project:', firebaseApp?.options?.projectId)
    } catch {
      /* no-op */
    }

    console.log('Configured Firestore persistent local cache.')

    // Initialize document/collection references after db is initialized and config is available
    if (appConfig.organization.id && appConfig.device.id) {
      fsOrganizationDocRef = doc(db, 'Organizations', appConfig.organization.id)
      fsDeviceDocRef = doc(fsOrganizationDocRef, 'Devices', appConfig.device.id) // Uses fsOrganizationDocRef
      fsUpdatesCollectionRef = collection(fsOrganizationDocRef, 'Updates') // Uses fsOrganizationDocRef
      fsEditsCollectionRef = collection(fsDeviceDocRef, 'Edits')
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

// Accessor for Firestore db instance (read-only usage outside this module)
export function getFirestoreDb() {
  return db
}

// Helpers to toggle Firestore network for debugging/offline simulations
export async function goFirestoreOffline() {
  if (!db) return
  await disableNetwork(db)
  console.log('Firestore network disabled (offline mode).')
}

export async function goFirestoreOnline() {
  if (!db) return
  await enableNetwork(db)
  console.log('Firestore network enabled (online mode).')
}

async function setupFirestoreListenersAndChecks() {
  console.log('Setting up Firestore listeners and initial checks...')
  await checkParentDocuments() // Call the new function

  // Make Firestore references available globally for BetterForms utilities
  if (typeof window !== 'undefined') {
    window.fsOrganizationRef = fsOrganizationDocRef
    window.fsDeviceRef = fsDeviceDocRef
    window.fsUpdatesRef = fsUpdatesCollectionRef
    window.fsUpdatesRefUnsubscribe = fsUpdatesRefUnsubscribe
    window.fsEditsRef = fsEditsCollectionRef
    window.fsEditsRefUnsubscribe = fsEditsRefUnsubscribe
    console.log('Firestore references exposed globally for BetterForms compatibility')
  }

  // First, hydrate the device timestamp from Firebase before setting up subscription
  try {
    const appConfig = useAppConfigStore()
    if (fsDeviceDocRef) {
      const deviceSnap = await getDoc(fsDeviceDocRef)
      if (deviceSnap.exists()) {
        const tsField = deviceSnap.data()?.tsModFireStoreLastUpdate
        if (tsField) {
          const isoString =
            typeof tsField.toDate === 'function'
              ? tsField.toDate().toISOString()
              : new Date(tsField).toISOString()
          appConfig.device.tsModFireStoreLastUpdate = isoString
          console.log('Hydrated device timestamp from Firebase:', isoString)
        } else {
          console.log('No tsModFireStoreLastUpdate field found in Firebase device document')
        }
      } else {
        console.log('Device document does not exist in Firebase yet')
      }
    }
  } catch (error) {
    console.warn('Failed to hydrate device timestamp:', error)
  }

  // Now set up the updates subscription with the hydrated timestamp
  try {
    const { namedAction } = await import('./utils/betterFormsUtils')
    const result = await namedAction('subscribeUpdates')
    console.log('subscribeUpdates result:', result)
  } catch (error) {
    console.error('Error setting up updates subscription:', error)
  }

  // Listener to track local pending writes for Edits
  try {
    const appConfig = useAppConfigStore()
    if (fsEditsRefUnsubscribe) {
      fsEditsRefUnsubscribe()
    }
    if (fsEditsCollectionRef) {
      fsEditsRefUnsubscribe = onSnapshot(
        fsEditsCollectionRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          let pending = 0
          snapshot.docs.forEach((docSnap) => {
            if (docSnap.metadata && docSnap.metadata.hasPendingWrites) pending += 1
          })
          appConfig.editsLocalPendingWrites = pending
        },
        (error) => {
          console.warn('Edits pending-writes listener error:', error?.message || error)
        },
      )
      window.fsEditsRefUnsubscribe = fsEditsRefUnsubscribe
      console.log('Edits pending-writes listener established')
    }
  } catch (e) {
    console.warn('Failed to establish Edits pending-writes listener', e)
  }

  console.log('Firestore listeners and checks setup complete.')
}

// We will define subscribeOrg, subscribeDevice, processSnapshot, subscribeUpdates,
// and other listener logic here incrementally.

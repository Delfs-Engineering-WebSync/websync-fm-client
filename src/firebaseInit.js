import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  collection,
  setDoc,
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

  // Make Firestore references available globally for BetterForms utilities
  if (typeof window !== 'undefined') {
    window.fsOrganizationRef = fsOrganizationDocRef
    window.fsDeviceRef = fsDeviceDocRef
    window.fsUpdatesRef = fsUpdatesCollectionRef
    window.fsUpdatesRefUnsubscribe = fsUpdatesRefUnsubscribe
    console.log('Firestore references exposed globally for BetterForms compatibility')
  }

  // Set up the updates subscription
  try {
    const { namedAction } = await import('./utils/betterFormsUtils')
    const result = await namedAction('subscribeUpdates')
    console.log('subscribeUpdates result:', result)
  } catch (error) {
    console.error('Error setting up updates subscription:', error)
  }

  console.log('Firestore listeners and checks setup complete.')
}

// We will define subscribeOrg, subscribeDevice, processSnapshot, subscribeUpdates,
// and other listener logic here incrementally.

// BetterForms Utility Functions
// This module provides Vue equivalents for common BetterForms utilities

import { useAppConfigStore } from '../stores/appConfig'
import { fmBridgit } from '../fileMakerBridge'
import {
  doc,
  updateDoc,
  getFirestore,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore'

// Equivalent to BF.getQueryParam()
export function getQueryParam(paramName) {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get(paramName)
}

// Equivalent to BF.getUUID()
export function getUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// FSUpdatesHandler - Process incoming updates from Firestore
// CRDT System: These are resolved conflict-free updates from the cloud resolver
// Each update contains fields with the most recent timestamps (field-level conflict resolution)
// The cloud resolver has already compared field-level timestamps and selected "winning" values
async function handleFSUpdates(options) {
  const appConfig = useAppConfigStore()

  // Check if we should process updates
  if (typeof fmBridgit === 'undefined') {
    log('FSUpdatesHandler - FileMaker not detected, skipping', 'warn')
    return { success: false, message: 'FileMaker not available' }
  }

  if (appConfig.device.deviceMode === 'passive') {
    log('FSUpdatesHandler - Device in passive mode, skipping', 'info')
    return { success: true, message: 'Passive mode - no processing needed' }
  }

  const updates = options.updates || []

  if (!updates.length) {
    log('FSUpdatesHandler - No updates to process', 'info')
    return { success: true, message: 'No updates to process' }
  }

  // Filter updates - only include those this device hasn't changed
  const updatesFiltered = []
  updates.forEach((update) => {
    const minimalUpdate = {
      id: update.id,
      _table: update._table,
      _tsModFireStore: update._tsModFireStore,
      _ts: {},
    }

    if (typeof update._ts === 'undefined') {
      update._ts = {}
    }

    // Process timestamp fields - each field has its own timestamp for conflict resolution
    // Format: _ts: { fieldName: { ts: fileMakerTimestamp }, ... }
    // FileMaker timestamps are in milliseconds/microseconds UTC format
    Object.keys(update._ts).forEach((key) => {
      if (typeof update._ts[key] === 'number') {
        minimalUpdate[key] = update[key]
        minimalUpdate._ts[key] = update._ts[key]
      } else if (typeof update._ts[key] === 'object') {
        minimalUpdate[key] = update[key]
        minimalUpdate._ts[key] = update._ts[key]
      }
    })

    // Add container and batch info if present
    if (update?.devicePendingContainer) {
      minimalUpdate.devicePendingContainer = update.devicePendingContainer
    }
    if (update?.batchTotalEdits) {
      minimalUpdate.batchTotalEdits = update.batchTotalEdits
    }
    if (update?.batchIdEdits) {
      minimalUpdate.batchIdEdits = update.batchIdEdits
    }

    updatesFiltered.push(minimalUpdate)
  })

  // Add to updates queue
  appConfig.updatesQueue.push(...updatesFiltered)
  appConfig.updatesTotal += updatesFiltered.length

  log(
    `Batched updates: ${updatesFiltered.length}, Total Updates: ${appConfig.updatesQueue.length}`,
    'info',
  )

  // If already updating, don't start another process
  if (appConfig.isUpdatingFM) {
    return { success: true, message: 'Update process already running' }
  }

  // Start the update process
  return await sendUpdatesToDatabase(appConfig)
}

// Helper function to send updates to FileMaker database
async function sendUpdatesToDatabase(appConfig) {
  const batchSize = appConfig.fmUpdatesBatchSize || 10 // Default batch size
  let updatedTsModFireStoreLastUpdate = false

  appConfig.isUpdatingFM = true

  try {
    while (appConfig.updatesQueue.length > 0) {
      appConfig.startProcessing()

      const batch = appConfig.updatesQueue.slice(0, batchSize)
      const script = 'API - Web Sync Inbound dispatcher {payload}'
      const parameter = {
        updates: batch,
        remaining: appConfig.updatesQueue.length - batch.length,
      }

      log(`Sending updates: ${batch.length}`, 'info')

      const result = await fmBridgit.performScript(script, JSON.stringify(parameter), 10000)

      if (result.success) {
        log(`${batch.length} Updates successfully saved!`, 'info')
        appConfig.updatesTotalCompleted += batch.length

        // Process batch completion logic
        const timestampUpdated = updatesBatchesObject(batch, appConfig)
        if (timestampUpdated) {
          updatedTsModFireStoreLastUpdate = true
        }

        // Remove processed items from queue
        appConfig.updatesQueue.splice(0, batch.length)

        // Update local storage if needed
        try {
          const lsObjStr = window.localStorage.device
          if (lsObjStr && updatedTsModFireStoreLastUpdate) {
            const lsObj = JSON.parse(lsObjStr)
            lsObj.tsModFireStoreLastUpdate = appConfig.device.tsModFireStoreLastUpdate
            window.localStorage.device = JSON.stringify(lsObj)
          }
        } catch {
          log('Error updating device object in localStorage', 'error')
        }
      } else {
        log(`ERROR writing batch to database: ${JSON.stringify(result.error)}`, 'error')
        break
      }
    }

    // Update Firestore timestamp if needed
    if (updatedTsModFireStoreLastUpdate) {
      try {
        const db = getFirestore()
        const deviceRef = doc(
          db,
          'Organizations',
          appConfig.organization.id,
          'Devices',
          appConfig.device.id,
        )
        await updateDoc(deviceRef, {
          tsModFireStoreLastUpdate: new Date(appConfig.device.tsModFireStoreLastUpdate),
        })
      } catch (error) {
        log(`Error updating Firestore timestamp: ${error.message}`, 'error')
      }
    }

    // Check if all updates completed
    if (appConfig.updatesTotal === appConfig.updatesTotalCompleted) {
      log('Updates Completed!', 'info')
      appConfig.updatesTotal = 0
      appConfig.updatesTotalCompleted = 0
    }

    // Re-subscribe if timestamp was updated
    if (updatedTsModFireStoreLastUpdate) {
      log('Re-subscribing device with new timestamp', 'info')
      namedAction('subscribeUpdatesDebounce')
    }

    return { success: true, message: 'Updates processed successfully' }
  } catch (error) {
    log(`Error in sendUpdatesToDatabase: ${error.message}`, 'error')
    return { success: false, error: error.message }
  } finally {
    appConfig.isUpdatingFM = false
    // Always stop processing spinner when loop completes or errors
    try {
      appConfig.endProcessing()
      log('sendUpdatesToDatabase - processing ended', 'info')
    } catch {
      /* no-op */
    }
  }
}

// Helper function to manage batch completion tracking
function updatesBatchesObject(batch, appConfig) {
  // Helper functions for timestamp conversion
  function tsToMillis(ts) {
    if (ts && ts.toMillis) {
      return ts.toMillis() + (ts.nanoseconds || 0) / 1e6
    }
    return Date.parse(ts)
  }

  function tsToIsoString(ts) {
    if (ts && ts.toMillis) {
      const timestampMillis = ts.toMillis()
      const timestampWithMilliseconds = timestampMillis + (ts.nanoseconds || 0) / 1e6
      return new Date(timestampWithMilliseconds).toISOString()
    }
    return new Date(ts).toISOString()
  }

  function compareCurrentTs(batchIdEdits, ts) {
    if (!Object.prototype.hasOwnProperty.call(appConfig.updatesBatches, batchIdEdits)) {
      appConfig.updatesBatches[batchIdEdits] = { latestTs: ts }
    } else if (tsToMillis(ts) > tsToMillis(appConfig.updatesBatches[batchIdEdits].latestTs)) {
      appConfig.updatesBatches[batchIdEdits].latestTs = ts
    }
  }

  // Process each edit in the batch
  let timestampUpdated = false

  batch.forEach((edit) => {
    if (edit.batchIdEdits) {
      compareCurrentTs(edit.batchIdEdits, edit._tsModFireStore)

      const batchInfo = appConfig.updatesBatches[edit.batchIdEdits]
      const totalReceived = batchInfo.totalReceived || 0

      if (totalReceived + 1 === edit.batchTotalEdits || edit.batchTotalEdits === 1) {
        // Batch complete - update timestamp
        appConfig.device.tsModFireStoreLastUpdate = tsToIsoString(batchInfo.latestTs)
        delete appConfig.updatesBatches[edit.batchIdEdits]
        timestampUpdated = true
      } else {
        // Batch not complete - increment counter
        batchInfo.totalReceived = totalReceived + 1
      }
    }
  })

  return timestampUpdated
}

// Handle editsUpdateStatus action
async function handleEditsUpdateStatus(options) {
  const appConfig = useAppConfigStore()

  try {
    const prevState = appConfig.editsCurrentState
    const prevPending = appConfig.editsTotalPending

    if (options.currentState) {
      appConfig.editsCurrentState = options.currentState
    }

    if (typeof options.pendingEdits !== 'undefined') {
      appConfig.editsTotalPending = options.pendingEdits
    }

    if (prevState !== appConfig.editsCurrentState || prevPending !== appConfig.editsTotalPending) {
      log(
        `[editsUpdateStatus] state ${prevState}→${appConfig.editsCurrentState}, pending ${prevPending}→${appConfig.editsTotalPending}`,
        'info',
      )
    }

    // Return success to FileMaker
    if (typeof fmBridgit !== 'undefined') {
      try {
        await fmBridgit.returnResult({ status: 'ok' })
      } catch {
        // Continue execution even if FileMaker acknowledgment fails
      }
    } else {
      log(`[WARN] fmBridgit not available for returnResult`, 'warn')
    }

    const result = { success: true, message: 'Edit status updated' }
    return Promise.resolve(result)
  } catch (error) {
    log(`[ERROR] Error in handleEditsUpdateStatus: ${error.message}`, 'error')
    log(`[ERROR] Error stack: ${error.stack}`, 'error')
    const errorResult = { success: false, error: error.message }
    log(
      `[DEBUG] handleEditsUpdateStatus returning error: ${JSON.stringify(errorResult, null, 2)}`,
      'info',
    )
    return Promise.resolve(errorResult)
  }
}

// Handle updatesContainerDownloads action
async function handleUpdatesContainerDownloads(options) {
  const appConfig = useAppConfigStore()

  log(
    `[DEBUG] handleUpdatesContainerDownloads called with options: ${JSON.stringify(options, null, 2)}`,
    'info',
  )
  log(`[DEBUG] Current appConfig state before update:`, 'info')
  log(`[DEBUG] - updateTotalContainers: ${appConfig.updateTotalContainers}`, 'info')
  log(`[DEBUG] - updateCompletedContainers: ${appConfig.updateCompletedContainers}`, 'info')

  try {
    if (typeof options?.updates?.totalContainers !== 'undefined') {
      const oldValue = appConfig.updateTotalContainers
      appConfig.updateTotalContainers += options.updates.totalContainers
      log(
        `[DEBUG] Updated updateTotalContainers from ${oldValue} to ${appConfig.updateTotalContainers}`,
        'info',
      )
    }

    if (typeof options?.updates?.completedContainers !== 'undefined') {
      const oldValue = appConfig.updateCompletedContainers
      appConfig.updateCompletedContainers += options.updates.completedContainers
      log(
        `[DEBUG] Updated updateCompletedContainers from ${oldValue} to ${appConfig.updateCompletedContainers}`,
        'info',
      )
    }

    // Reset counters when complete
    if (appConfig.updateCompletedContainers === appConfig.updateTotalContainers) {
      log(`[DEBUG] Container download complete, resetting counters`, 'info')
      appConfig.updateCompletedContainers = 0
      appConfig.updateTotalContainers = 0
    }

    // Handle overflow
    if (appConfig.updateCompletedContainers > appConfig.updateTotalContainers) {
      log(`[WARN] Container overflow detected, resetting completed count`, 'warn')
      appConfig.updateCompletedContainers = 0
    }

    log(`[DEBUG] Final appConfig state after update:`, 'info')
    log(`[DEBUG] - updateTotalContainers: ${appConfig.updateTotalContainers}`, 'info')
    log(`[DEBUG] - updateCompletedContainers: ${appConfig.updateCompletedContainers}`, 'info')

    // Return success to FileMaker
    if (typeof fmBridgit !== 'undefined') {
      log(`[DEBUG] fmBridgit available, calling returnResult with status: ok`, 'info')
      try {
        const result = await fmBridgit.returnResult({ status: 'ok' })
        log(
          `[DEBUG] fmBridgit.returnResult completed successfully: ${JSON.stringify(result)}`,
          'info',
        )
      } catch (error) {
        log(`[WARN] fmBridgit.returnResult failed: ${error.message}`, 'warn')
        log(`[WARN] This is expected behavior - FileMaker may reject some acknowledgments`, 'warn')
        // Continue execution even if FileMaker acknowledgment fails
      }
    } else {
      log(`[WARN] fmBridgit not available for returnResult`, 'warn')
    }

    const result = { success: true, message: 'Container downloads updated' }
    log(
      `[DEBUG] handleUpdatesContainerDownloads returning: ${JSON.stringify(result, null, 2)}`,
      'info',
    )
    return Promise.resolve(result)
  } catch (error) {
    log(`[ERROR] Error in handleUpdatesContainerDownloads: ${error.message}`, 'error')
    log(`[ERROR] Error stack: ${error.stack}`, 'error')
    const errorResult = { success: false, error: error.message }
    log(
      `[DEBUG] handleUpdatesContainerDownloads returning error: ${JSON.stringify(errorResult, null, 2)}`,
      'info',
    )
    return Promise.resolve(errorResult)
  }
}

// Handle webSyncReceivePayload action
async function handleWebSyncReceivePayload(options) {
  const appConfig = useAppConfigStore()
  const payload = options.payload

  log(`[DEBUG] webSyncReceivePayload called with options:`, 'info')
  log(`[DEBUG] Options keys: ${Object.keys(options || {}).join(', ')}`, 'info')
  log(`[DEBUG] Payload type: ${typeof payload}`, 'info')
  log(`[DEBUG] Payload content: ${JSON.stringify(payload, null, 2)}`, 'info')

  if (!payload) {
    log('[ERROR] No payload provided to webSyncReceivePayload', 'error')
    return Promise.resolve({ success: false, message: 'No payload provided' })
  }

  // Handle status ping
  if (payload.status) {
    log('[DEBUG] Status ping received, acknowledging', 'info')
    if (typeof fmBridgit !== 'undefined') {
      fmBridgit.returnResult({ status: 'ok' })
    }
    return Promise.resolve({ success: true, message: 'Status ping acknowledged' })
  }

  // Process edits if they exist
  if (payload.edits && Array.isArray(payload.edits)) {
    log(`[DEBUG] Processing ${payload.edits.length} edits from FileMaker`, 'info')
    log(`[DEBUG] Edits array: ${JSON.stringify(payload.edits, null, 2)}`, 'info')

    // Wait for Firebase to be ready
    let counter = 0
    const maxAttempts = 5

    while (counter < maxAttempts) {
      log(`[DEBUG] Firebase readiness check attempt ${counter + 1}/${maxAttempts}`, 'info')

      // Check if we have Firebase references
      if (window.fsDeviceRef && window.fsOrganizationRef) {
        log('[DEBUG] Firebase references available, proceeding with edit processing', 'info')

        try {
          // Process each edit and create Firestore documents
          for (const edit of payload.edits) {
            log(`[DEBUG] Processing edit: ${JSON.stringify(edit, null, 2)}`, 'info')

            // Create edit document in Firestore
            const editData = {
              ...edit, // include all edit fields coming from FileMaker
              id: edit.id || null, // keep the table record id in-field
              _table: edit._table || edit.table || 'UnknownTable',
              _tsModFireStore: new Date(),
              _ts: edit._ts || {},
              _contexts: appConfig.device.contexts || [],
            }

            log(
              `[DEBUG] Prepared edit data for Firestore: ${JSON.stringify(editData, null, 2)}`,
              'info',
            )

            // Add to Firestore collection
            try {
              const { doc, setDoc, getDoc, collection } = await import('firebase/firestore')
              const editsColRef = collection(window.fsDeviceRef, 'Edits')
              const editRef = doc(editsColRef) // auto-generated Firestore ID

              log(
                `[DEBUG] Creating Firestore document at: Organizations/${appConfig.organization.id}/Devices/${appConfig.device.id}/Edits/${editData.id}`,
                'info',
              )

              await setDoc(editRef, editData)
              try {
                const snap = await getDoc(editRef)
                log(
                  `[DEBUG] Read-back after write → exists: ${snap.exists()}, fromCache: ${snap.metadata?.fromCache}, hasPendingWrites: ${snap.metadata?.hasPendingWrites}`,
                  'info',
                )
              } catch (rbErr) {
                log(`[WARN] Read-back check failed: ${rbErr?.message || rbErr}`, 'warn')
              }
              log(
                `[DEBUG] Successfully created Firestore document for edit: ${editData.id}`,
                'info',
              )

              // Update local state
              if (edit.typeEdit === 'containerIsUploaded') {
                appConfig.editsContainersComplete += 1
                log(
                  `[DEBUG] Updated container completion count: ${appConfig.editsContainersComplete}`,
                  'info',
                )
              }
            } catch (firestoreError) {
              log(
                `[ERROR] Failed to create Firestore document for edit ${editData.id}: ${firestoreError.message}`,
                'error',
              )
              log(
                `[ERROR] Firestore error details: ${JSON.stringify(firestoreError, null, 2)}`,
                'error',
              )
            }
          }

          // Update edit state
          appConfig.editsCurrentState = '4'
          log(`[DEBUG] Updated edit state to: ${appConfig.editsCurrentState}`, 'info')

          // Stop processing spinner when uploads finish for this payload
          try {
            appConfig.endProcessing()
          } catch {
            /* no-op */
          }

          // Reset counters when complete
          if (appConfig.editsContainersComplete === appConfig.editsContainersTotal) {
            appConfig.editsContainersComplete = 0
            appConfig.editsContainersTotal = 0
            log('[DEBUG] Reset container counters', 'info')
          }

          // Return success to FileMaker with timestamp if provided
          const response = {
            payload: payload.modificationTimestampUTCEnd
              ? {
                  modificationTimestampUTCEnd: payload.modificationTimestampUTCEnd,
                }
              : {},
          }

          log(
            `[DEBUG] Returning success response to FileMaker: ${JSON.stringify(response, null, 2)}`,
            'info',
          )

          if (typeof fmBridgit !== 'undefined') {
            fmBridgit.returnResult(response)
            log('[DEBUG] Result returned to FileMaker via fmBridgit', 'info')
          }

          return Promise.resolve({ success: true, message: 'Payload processed successfully' })
        } catch (processingError) {
          log(`[ERROR] Error processing edits: ${processingError.message}`, 'error')
          log(
            `[ERROR] Processing error details: ${JSON.stringify(processingError, null, 2)}`,
            'error',
          )
          return Promise.resolve({
            success: false,
            message: `Processing error: ${processingError.message}`,
          })
        }
      } else {
        counter++
        log(`[WARN] Firebase not ready yet, attempt: ${counter}/${maxAttempts}`, 'warn')
        log(`[DEBUG] fsDeviceRef available: ${!!window.fsDeviceRef}`, 'info')
        log(`[DEBUG] fsOrganizationRef available: ${!!window.fsOrganizationRef}`, 'info')

        if (counter >= maxAttempts) {
          log('[ERROR] webSync Timeout - Firebase not ready after maximum attempts', 'error')
          return Promise.resolve({ success: false, message: 'Firebase timeout' })
        }

        // Wait 1 second before retry
        log(`[DEBUG] Waiting 1 second before retry...`, 'info')
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  } else {
    log('[WARN] No edits array found in payload', 'warn')
    log(`[DEBUG] Payload keys: ${Object.keys(payload).join(', ')}`, 'info')
  }

  log('[DEBUG] webSyncReceivePayload completed without processing edits', 'info')
  return Promise.resolve({ success: false, message: 'No edits to process' })
}

// Handle subscribeUpdates action - Set up Firestore listener for updates
function handleSubscribeUpdates() {
  const appConfig = useAppConfigStore()

  // Check if device should subscribe to updates
  if (appConfig.device.deviceMode === 'passive') {
    log('subscribeUpdates - Device in passive mode, skipping subscription', 'info')
    return Promise.resolve({ success: true, message: 'Passive mode - no subscription needed' })
  }

  try {
    // Determine timestamp for filtering
    const defaultTimestamp = new Date()
    const timestamp = appConfig.device.tsModFireStoreLastUpdate
      ? new Date(appConfig.device.tsModFireStoreLastUpdate)
      : defaultTimestamp

    log(
      `subscribeUpdates - Starting subscription from timestamp: ${timestamp.toISOString()}`,
      'info',
    )

    // Update device timestamp if using default
    if (timestamp === defaultTimestamp) {
      appConfig.device.tsModFireStoreLastUpdate = timestamp

      // Save back to Firestore if we have references
      if (window.fsDeviceRef) {
        try {
          const db = getFirestore()
          const deviceRef = doc(
            db,
            'Organizations',
            appConfig.organization.id,
            'Devices',
            appConfig.device.id,
          )
          updateDoc(deviceRef, {
            tsModFireStoreLastUpdate: timestamp,
          }).catch((error) => {
            log(`Error updating device timestamp: ${error.message}`, 'error')
          })
        } catch (error) {
          log(`Error accessing Firestore for timestamp update: ${error.message}`, 'error')
        }
      }
    }

    // Clean up existing subscription if any
    if (window.fsUpdatesRefUnsubscribe && typeof window.fsUpdatesRefUnsubscribe === 'function') {
      window.fsUpdatesRefUnsubscribe()
      log('subscribeUpdates - Cleaned up existing subscription', 'info')
    }

    // Check if we have the required Firestore references
    if (!window.fsUpdatesRef) {
      log('subscribeUpdates - Firestore updates reference not available, cannot subscribe', 'warn')
      return Promise.resolve({ success: false, message: 'Firestore references not available' })
    }

    // Set up the Firestore query
    const updatesQuery = query(
      window.fsUpdatesRef,
      orderBy('_tsModFireStore', 'asc'),
      where('_tsModFireStore', '>', Timestamp.fromDate(timestamp)),
      where('_contexts', 'array-contains-any', appConfig.device.contexts),
    )

    // Set up the snapshot listener
    window.fsUpdatesRefUnsubscribe = onSnapshot(
      updatesQuery,
      { includeMetadataChanges: false },
      (snapshot) => {
        processSnapshot(snapshot, appConfig)
      },
      (error) => {
        log(`subscribeUpdates - Snapshot listener error: ${error.message}`, 'error')
      },
    )

    log('subscribeUpdates - Firestore listener established successfully', 'info')
    return Promise.resolve({ success: true, message: 'Updates subscription established' })
  } catch (error) {
    log(`subscribeUpdates - Error setting up subscription: ${error.message}`, 'error')
    return Promise.resolve({ success: false, error: error.message })
  }
}

// Process Firestore snapshot changes and call FSUpdatesHandler
// Process Firestore snapshot changes - part of the CRDT subscription system
// This handles real-time updates from the cloud resolver containing conflict-free data
function processSnapshot(snapshot, appConfig) {
  if (!snapshot || snapshot.empty) {
    log('processSnapshot - No updates in snapshot', 'info')
    return
  }

  const updates = []
  const notToIncludeInTs = ['devicePendingContainer', 'batchTotalEdits', 'batchIdEdits']

  snapshot.docChanges().forEach(async (change) => {
    const update = change.doc.data()

    if (change.type === 'added' || change.type === 'modified') {
      log(
        `processSnapshot - Processing ${change.type} update: ${update.id || change.doc.id}`,
        'info',
      )

      // Trigger processing state
      namedAction('isProcessing')

      // Process timestamp filtering
      const tsStart = 62135596800 // Offset for FileMaker timestamp in milliseconds
      const currentTsModFireStoreLastUpdate =
        Date.parse(appConfig.device.tsModFireStoreLastUpdate) / 1000

      // Initialize updatedKeys if not present
      if (!update.updatedKeys) {
        update.updatedKeys = []
      }

      // Check which fields have been updated since last sync
      if (update._ts) {
        for (const [key, value] of Object.entries(update._ts)) {
          if (value && value.ts) {
            const keyTs = Math.round(value.ts / 1000) - tsStart
            if (keyTs > currentTsModFireStoreLastUpdate && !update.updatedKeys.includes(key)) {
              update.updatedKeys.push(key)
            }
          }
        }
      }

      // Create minimal update object
      const updatedObj = {
        _table: update._table,
        id: update.id || change.doc.id,
        _tsModFireStore: update._tsModFireStore,
        _ts: {},
      }

      // Add only updated fields
      update.updatedKeys.forEach((key) => {
        updatedObj[key] = update[key]
        if (!notToIncludeInTs.includes(key)) {
          updatedObj._ts[key] = update._ts[key]
        }
      })

      // Add batch information if present
      if (update.batchTotalEdits) updatedObj.batchTotalEdits = update.batchTotalEdits
      if (update.batchIdEdits) updatedObj.batchIdEdits = update.batchIdEdits
      if (update.devicePendingContainer)
        updatedObj.devicePendingContainer = update.devicePendingContainer

      updates.push(updatedObj)
    }
  })

  // Process updates if any
  if (updates.length > 0) {
    log(`processSnapshot - Calling FSUpdatesHandler with ${updates.length} updates`, 'info')

    // Get the latest timestamp for tracking
    const latestUpdate = updates[updates.length - 1]
    const _tsModFireStoreLastUpdate = latestUpdate._tsModFireStore

    // Call FSUpdatesHandler
    namedAction('FSUpdatesHandler', {
      updates: updates,
      _tsModFireStoreLastUpdate:
        _tsModFireStoreLastUpdate instanceof Date
          ? _tsModFireStoreLastUpdate
          : new Date(_tsModFireStoreLastUpdate),
    })
  }
}

// Equivalent to BF.namedAction() - but uses Pinia actions instead
export function namedAction(actionName, options = {}) {
  const appConfig = useAppConfigStore()

  let result

  try {
    switch (actionName) {
      case 'isProcessing':
        log(`[DEBUG] Starting isProcessing action`, 'info')
        result = appConfig.startProcessing()
        log(`[DEBUG] isProcessing result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'endProcessing':
        log(`[DEBUG] Starting endProcessing action`, 'info')
        result = appConfig.endProcessing()
        log(`[DEBUG] endProcessing result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'promptUserToConfigure':
        log(`[DEBUG] Starting promptUserToConfigure action`, 'info')
        // Mock user configuration prompt
        console.log('[namedAction] promptUserToConfigure called')
        result = Promise.resolve({ success: true, message: 'User prompted (mocked)' })
        log(`[DEBUG] promptUserToConfigure result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'getSignedURL':
        log(`[DEBUG] Starting getSignedURL action`, 'info')
        // Mock signed URL generation (used by Uppy in original)
        console.log('[namedAction] getSignedURL called with options:', options)
        result = Promise.resolve(`https://mock-signed-url.com/${options.name}`)
        log(`[DEBUG] getSignedURL result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'FSUpdatesHandler':
        log(`[DEBUG] Starting FSUpdatesHandler action`, 'info')
        result = handleFSUpdates(options)
        log(`[DEBUG] FSUpdatesHandler result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'editsUpdateStatus':
        log(`[DEBUG] Starting editsUpdateStatus action`, 'info')
        result = handleEditsUpdateStatus(options)
        log(`[DEBUG] editsUpdateStatus result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'updatesContainerDownloads':
        log(`[DEBUG] Starting updatesContainerDownloads action`, 'info')
        result = handleUpdatesContainerDownloads(options)
        log(`[DEBUG] updatesContainerDownloads result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'webSyncReceivePayload':
        log(`[DEBUG] Starting webSyncReceivePayload action`, 'info')
        result = handleWebSyncReceivePayload(options)
        log(`[DEBUG] webSyncReceivePayload result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'subscribeUpdates':
        log(`[DEBUG] Starting subscribeUpdates action`, 'info')
        result = handleSubscribeUpdates(options)
        log(`[DEBUG] subscribeUpdates result: ${JSON.stringify(result, null, 2)}`, 'info')
        return result

      case 'subscribeUpdatesDebounce':
        // This would typically implement a debounced version of subscribeUpdates
        // For now, we'll just log it
        log('subscribeUpdatesDebounce called - would re-subscribe to updates', 'info')
        return Promise.resolve({ success: true, message: 'Debounced subscription triggered' })

      default:
        console.warn(`[namedAction] Unknown action: ${actionName}`)
        return Promise.resolve({ success: false, message: `Unknown action: ${actionName}` })
    }
  } catch (error) {
    log(`[ERROR] Error in namedAction ${actionName}: ${error.message}`, 'error')
    log(`[ERROR] Error stack: ${error.stack}`, 'error')
    return Promise.resolve({ success: false, error: error.message })
  }
}

// Equivalent to BF.actionsClear()
export function actionsClear() {
  console.log('[BF] actionsClear called - clearing action queue (mocked)')
  // In BetterForms this clears the action queue
  // In Vue, we might clear pending operations or reset state
  const appConfig = useAppConfigStore()
  appConfig.endProcessing()
}

// Equivalent to BF.setGlobalVar()
export function setGlobalVar(varName, value) {
  const appConfig = useAppConfigStore()

  // Map common BetterForms global variables to Pinia state
  switch (varName) {
    case 'isProcessing':
      if (value) {
        appConfig.startProcessing()
      } else {
        appConfig.endProcessing()
      }
      break

    default:
      // For other variables, we could extend the store or use a generic approach
      console.log(`[setGlobalVar] ${varName} = ${value}`)
      // Could store in a generic globals object in the store if needed
      break
  }
}

// Equivalent to BF.getGlobalVar()
export function getGlobalVar(varName) {
  const appConfig = useAppConfigStore()

  switch (varName) {
    case 'isProcessing':
      return appConfig.isProcessing

    case 'deviceId':
      return appConfig.device.id

    case 'organizationId':
      return appConfig.organization.id

    default:
      console.warn(`[getGlobalVar] Unknown variable: ${varName}`)
      return null
  }
}

// Equivalent to BF.showAlert() or BF.showDialog()
export function showAlert(message, title = 'Alert') {
  // In a real app, you might use a toast library or modal component
  console.log(`[Alert] ${title}: ${message}`)
  alert(`${title}\n\n${message}`)
}

// Equivalent to BF.log() or BF.console()
export function log(message, level = 'info') {
  const timestamp = new Date().toISOString()
  const prefix = `[BF-${level.toUpperCase()}] ${timestamp}`

  switch (level) {
    case 'error':
      console.error(prefix, message)
      break
    case 'warn':
      console.warn(prefix, message)
      break
    case 'debug':
      console.debug(prefix, message)
      break
    default:
      console.log(prefix, message)
  }
}

// Create a BF-like global object for compatibility
// namedActionFM - FileMaker-specific named action handler
// This is called by FileMaker scripts and expects a JSON string parameter
// Always return a JSON string so FileMaker reliably receives text
export async function namedActionFM(jsonString) {
  try {
    const params = JSON.parse(jsonString)
    const { name, options = {} } = params

    log(`namedActionFM called: ${name}`, 'info')

    // Call the regular namedAction with parsed parameters and normalize to string
    const result = await Promise.resolve(namedAction(name, options))
    try {
      return JSON.stringify(result)
    } catch (stringifyError) {
      return JSON.stringify({
        success: false,
        error: `stringify_failed: ${String(stringifyError?.message || stringifyError)}`,
      })
    }
  } catch (error) {
    log(`Error in namedActionFM: ${error.message}`, 'error')
    return JSON.stringify({ success: false, error: String(error?.message || error) })
  }
}

export const BF = {
  getQueryParam,
  getUUID,
  namedAction,
  namedActionFM,
  actionsClear,
  setGlobalVar,
  getGlobalVar,
  showAlert,
  log,
}

// Make it available globally for maximum compatibility
if (typeof window !== 'undefined') {
  window.BF = BF
  window.processSnapshot = processSnapshot // For testing purposes
}

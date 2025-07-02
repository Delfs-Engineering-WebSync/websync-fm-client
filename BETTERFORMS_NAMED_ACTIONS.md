# BetterForms Named Actions Reference

This document contains the complete export of BetterForms named actions from the legacy application. This serves as a reference for implementing equivalent functionality in the Vue.js WebSync application.

## Action Categories

### Core System Actions

- `isProcessing` - Processing state management with debouncing
- `onAppLoad` - Main initialization sequence (SET CONFIG, CONFIG UPPY, FM Bridgit, PWA MANIFEST, initFireStore)
- `clearLog` - Clear application logs

### Firebase/Firestore Integration

- `initFireStore` - Complete Firestore initialization and subscription setup
- `FSUpdatesHandler` - Process incoming updates from Firestore
- `subscribeUpdates` - Subscribe to Firestore updates
- `subscribeUpdatesDebounce` - Debounced version of subscribeUpdates

### File Upload System (Uppy)

- `docUpload` - Handle document uploads
- `getSignedURL` - Get pre-signed URLs for S3 uploads (with debouncing)
- `runSignedURL` - Execute signed URL operations

### Navigation Actions

- `goBack` - Browser back navigation
- `gotoDownloadDocs` - Navigate to documents page
- `gotoHome` - Navigate to home page
- `gotoSettings` - Navigate to settings page
- `gotoUploadDocs` - Navigate to upload documents page

### Status Management

- `editsUpdateStatus` - Update edit status and pending counts
- `updatesContainerDownloads` - Track container download progress
- `validateJobs` - Validate job data

### Web Sync Communication

- `webSyncReceivePayload` - Receive payload from FileMaker
- `webSyncSendMessageFM` - Send messages to FileMaker

### PWA Features

- `installPWA` - Install PWA with prompts
- `installPWAPrompt` - Show PWA installation prompt

### Network State

- `appIsOffline` - Handle offline state
- `appIsOnline` - Handle online state
- `toggleOnline` - Toggle online/offline state

### User Configuration

- `promptUserToConfigure` - Prompt user for configuration

### Authentication

- `onLogin` - Handle user login (empty in export)

## Implementation Status

### ✅ Already Implemented

- `isProcessing` - Implemented in `src/stores/appConfig.js` with `startProcessing`/`endProcessing`
- URL parameter initialization (SET CONFIG portion of `onAppLoad`)
- Firebase initialization (`initFireStore` equivalent in `src/firebaseInit.js`)
- FileMaker bridge (`fmBridgit` equivalent in `src/fileMakerBridge.js`)
- BetterForms utilities (`BF` object in `src/utils/betterFormsUtils.js`)

### 🚧 Partially Implemented

- `FSUpdatesHandler` - Core update processing logic exists but needs full translation
- `subscribeUpdates` - Basic structure exists but needs completion
- Status management actions - Basic structure exists but needs refinement

### ❌ Not Yet Implemented

- File upload system (Uppy integration) - Explicitly omitted per user request
- PWA features - Omitted per user request
- Navigation actions - May implement as Vue Router actions
- Web sync communication - Needs implementation for FileMaker integration
- Network state management - Could be useful for offline functionality

## Key Implementation Notes

1. **State Management**: Legacy uses Vuex with `vueapp.$store.state.site.content.app`, we use Pinia with `appConfig` store
2. **Firebase SDK**: Legacy uses v8 SDK, we use v9+ modular SDK
3. **FileMaker Integration**: Legacy uses direct `FileMaker.PerformScript`, we use `fmBridgit` wrapper
4. **Debouncing**: Legacy uses BetterForms debounce actions, we need to implement equivalent
5. **Error Handling**: Legacy has extensive error handling that needs to be preserved
6. **Batch Processing**: Update processing uses batch operations that need careful implementation

## Priority Implementation Order

1. **High Priority** (Core functionality):

   - Complete `FSUpdatesHandler` implementation
   - Finish `subscribeUpdates` functionality
   - Implement `webSyncReceivePayload` and `webSyncSendMessageFM`
   - Complete status management actions

2. **Medium Priority** (Enhanced functionality):

   - Network state management
   - Enhanced error handling
   - Batch processing optimization

3. **Low Priority** (Optional features):
   - PWA features (if requested later)
   - File upload system (if requested later)
   - Advanced navigation features

## Code Structure Mapping

| Legacy Location                        | Vue.js Equivalent              |
| -------------------------------------- | ------------------------------ |
| `vueapp.$store.state.site.content.app` | `useAppConfigStore()`          |
| `BF.namedAction()`                     | `BF.namedAction()` (preserved) |
| `firebase.firestore()`                 | `import { getFirestore }`      |
| `FileMaker.PerformScript`              | `fmBridgit.PerformScript()`    |
| Global `window` variables              | Pinia store or composables     |

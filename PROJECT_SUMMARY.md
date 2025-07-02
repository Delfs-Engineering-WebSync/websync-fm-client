The user is creating a standalone web app that runs in a FileMaker web viewer. The app needs to bundle all assets (HTML, CSS, JS, Tailwind, Firestore, Font Awesome) into a single HTML file.

**Initial Setup & Single-File Build:**

- The project was started with Vite and Vue.js.
- We discussed Vite vs. Parcel for single-file bundling. The user started with Vite.
- `vite-plugin-singlefile` was installed and configured in `vite.config.js` to achieve the single HTML file output in the `dist` directory.
- The `npm run build` command was confirmed to produce this single file.
- The `.gitignore` file was initially ignoring the `dist` directory. The user decided to commit the `dist/index.html` file, so `dist` was removed from `.gitignore`.

**Tailwind CSS Integration:**

- Tailwind CSS, PostCSS, and Autoprefixer were installed.
- Initial attempts to generate `tailwind.config.js` and `postcss.config.js` using `npx tailwindcss init -p` failed due to the CLI tool not being found.
- We switched to the official Tailwind recommendation for Vite: using the `@tailwindcss/vite` plugin.
  - Uninstalled previous Tailwind packages.
  - Installed `tailwindcss` and `@tailwindcss/vite`.
  - Added `@tailwindcss/vite` to `vite.config.js`.
  - Manually created `tailwind.config.js` with content scanning paths (`./index.html`, `./src/**/*.{vue,js,ts,jsx,tsx}`).
  - Updated `src/assets/main.css` to include `@import 'tailwindcss';`.
- Tailwind was tested by adding `bg-blue-500 p-4` to `App.vue`'s header, which worked in dev mode.

**Build & Preview Issues & Resolution:**

- The user noted that the production build (`dist/index.html`) looked different from the dev server output and seemed too small.
- We confirmed no console errors in the production preview.
- The issue was traced to `src/assets/main.css` containing default Vite starter styles _after_ the `@import 'tailwindcss';` line. This caused specificity conflicts, especially with Tailwind's production purging.
- The user was asked to manually edit `src/assets/main.css` to contain _only_ `@import 'tailwindcss';` to resolve this, as tool-based edits were failing to apply correctly. (It's unclear if this manual edit was completed by the user before moving to Font Awesome).

**Font Awesome Integration (Bundled):**

- The user wants to use Font Awesome and provided a kit URL, but we decided to bundle it for offline/single-file use.
- Installed `@fortawesome/fontawesome-svg-core`, `@fortawesome/vue-fontawesome`, and `@fortawesome/free-solid-svg-icons`.
- Configured Font Awesome in `src/main.js`:
  - Imported `library`, `FontAwesomeIcon` component, and an example icon (`faUserSecret`).
  - Added the icon to the library.
  - Registered `FontAwesomeIcon` globally.
- An example `<font-awesome-icon :icon="['fas', 'user-secret']" />` was added to `App.vue` and confirmed working in dev mode.
- Discussed how Pro icons would be integrated (installing Pro packages, updating imports).

**State Management (Pinia) & Legacy Code Concepts:**

- The user explained their legacy BetterForms app used Vuex with a global `app` state object and page-specific `model` objects.
- We confirmed the current project uses Pinia.
- Global state (`app`) will be managed by Pinia stores.
- Page-specific state (`model`) will be managed using Vue 3 Composition API (`ref`, `reactive`) within components.

**Initial Configuration from URL Parameters (Legacy "SET CONFIG" step):**

- The user provided legacy JavaScript code that initializes app configuration (`app.organization.id`, `app.device.id`, `deviceMode`, `deviceType`, `contexts`) from URL query parameters using `BF.getQueryParam`.
- A Pinia store `src/stores/appConfig.js` was created.
- An action `initializeConfigFromURLParams` (initially `initializeConfig`) was added to this store to replicate the legacy logic, using `URLSearchParams` to get query params.
- This action is called from `App.vue`'s `onMounted` hook.
- The user provided their global `app` model structure from the legacy app.
- The `appConfig.js` store was significantly restructured to mirror this detailed global `app` model, including properties like `activeJob`, `configx`, `editsCurrentState`, `env`, `isOnline`, `isProcessing`, `jobs`, etc., with their default values.
- The `isProcessing` named action from BetterForms (sets `app.isProcessing = true`, debounces, then sets to `false`) was discussed. `startProcessing` and `endProcessing` actions were added to the `appConfig` store.

**Firebase Integration (Firestore):**

- The user wants to integrate Firestore. They provided legacy CDN script tags for Firebase v9.13.0 compat versions.
- We decided to use the modern Firebase v9+ modular SDK for better tree-shaking and smaller bundle size.
- The `firebase` npm package was installed.
- The user provided their `firebaseConfig` object.
- `src/firebaseConfig.js` was created to store these credentials.
- `src/firebaseInit.js` was created to handle Firebase initialization:
  - Initializes Firebase app and Firestore (v9 SDK).
  - Enables offline persistence.
  - Includes a placeholder for `BFNamedAction` (currently handles `isProcessing`).
  - The main export `initializeFirebaseServices` checks `appConfig.device.deviceMode` and initializes Firebase if not "passive".
  - It initializes Firestore document/collection references (`fsOrganizationDocRef`, `fsDeviceDocRef`, `fsUpdatesCollectionRef`) based on IDs from the `appConfigStore`.
- `initializeFirebaseServices` is called from `App.vue`'s `onMounted` hook after `initializeConfigFromURLParams`.
- The user provided a large `initFirestore` script from their legacy app.
- We started translating this script:
  - The `jobsRef.onSnapshot` listener from the legacy script was deemed cruft and will be ignored.
  - The `checkParentDocuments` function was translated to v9 SDK in `src/firebaseInit.js` and is called from `setupFirestoreListenersAndChecks` (which itself is called at the end of `initializeFirebaseServices`). This function ensures Organization and Device documents exist in Firestore, creating them with merge if necessary.

**File Uploads (Uppy - Deferred):**

- The user's legacy "CONFIG UPPY" step was discussed. It initializes Uppy for AWS S3 uploads.
- Key aspects of the legacy Uppy setup:
  - Relies on `file.meta.preSignedURL` being available.
  - Calls `FileMaker.PerformScriptWithOption` on completion.
  - Uses `window.uppy` and a page-level `model` object.
- The user clarified that in the legacy app, `window` was used to share state between BetterForms action script steps.
- Crucially, the user clarified that **pre-signed URLs are supplied by the parent FileMaker app** to the web viewer, not generated by the web app itself.
- The user then decided to **ignore file upload parts (Uppy) for now.**

**Project Structure & Files Created/Modified:**

- `vite.config.js`: Added `vite-plugin-singlefile`, `@tailwindcss/vite`.
- `package.json`: Added dependencies for `vite-plugin-singlefile`, `tailwindcss`, `@tailwindcss/vite`, Font Awesome (`@fortawesome/fontawesome-svg-core`, `@fortawesome/vue-fontawesome`, `@fortawesome/free-solid-svg-icons`), Firebase (`firebase`). Scripts `dev`, `build`, `preview`, `lint`, `format`, `test:unit` were reviewed.
- `.gitignore`: Modified to remove `dist` so build output is committed.
- `tailwind.config.js`: Created.
- `src/assets/main.css`: Modified for Tailwind setup.
- `src/main.js`: Configured Font Awesome.
- `src/App.vue`: Added Font Awesome icon for testing, calls Pinia store action for config init, calls Firebase init, displays some config for testing.
- `src/stores/appConfig.js`: Created Pinia store for global app state, mirroring legacy `app` model, including logic for URL param initialization and `isProcessing` state.
- `src/firebaseConfig.js`: Created with user's Firebase project credentials.
- `src/firebaseInit.js`: Created for Firebase v9 SDK initialization, offline persistence, and started translating `initFirestore` script (currently has `checkParentDocuments`).
- `README.md`: Updated with project setup, build info, key commands, and FileMaker integration details.

The project is currently set up to initialize its configuration from URL parameters, initialize Firebase (including creating/checking parent documents in Firestore if not in "passive" mode), and has basic Font Awesome integration. The next step was to continue translating the `initFirestore` script.

**CRDT System Architecture:**
User explained the system is actually a CRDT (Conflict-free Replicated Data Type) where:

- Edits are local changes pushed to cloud
- Cloud resolver processes conflicts using field-level timestamps
- Updates are resolved changes pushed back to subscribed devices
- Each field has individual timestamps in `_ts` object for conflict resolution
- System handles distributed data synchronization with proper conflict resolution

**Detailed CRDT Operation:**

**Field-Level Timestamp Resolution:**

- Each record has an `_ts` sub-object containing field-level timestamps
- Format: `_ts: { fieldName: { ts: timestamp }, ... }`
- Timestamps are FileMaker UTC timestamps in milliseconds/microseconds
- This enables field-level conflict resolution rather than record-level
- Most recent timestamp wins for each individual field

**Edit vs Update Flow:**

1. **Edits:** Local device changes uploaded to cloud Firestore

   - Single edit = single record change
   - Can come in batches as arrays, but each batch contains single edits for single records
   - Each edit triggers cloud resolver immediately upon upload

2. **Cloud Resolver Process:**

   - Triggered whenever any client adds record to edits table
   - Compares timestamps for each field based on record ID and field key
   - Most recent timestamp wins (if exact tie, last edit wins)
   - Produces resolved conflict-free updates

3. **Updates:** Resolved conflict-free data pushed back to subscribed devices
   - Contains the "winning" field values after conflict resolution
   - Devices apply these updates to maintain consistency

**Device Synchronization:**

- Device ID prevents circular edit-update conditions
- `_tsModFireStoreLastUpdate` tracks when device last synchronized
- When device comes back online, subscribes only to updates since last sync
- Prevents processing all historical resolved edits

**Container Handling:**

- `devicePendingContainer` field exists for document/file synchronization
- Currently focusing only on record data synchronization
- Document/container sync deferred for future implementation

**Current State:**
The app is a fully functional, professional-looking admin dashboard with dark theme, full-width layout, real-time status monitoring, progress tracking, debug capabilities, and comprehensive BetterForms compatibility layer. It successfully integrates Vue 3, Pinia, Tailwind CSS, Font Awesome, and Firebase while maintaining the single-file build requirement for FileMaker web viewer deployment. The core CRDT synchronization system is working end-to-end in production with proper field-level conflict resolution.

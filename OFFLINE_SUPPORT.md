# WebSync Offline Support

## Overview

WebSync now supports offline functionality in **both deployment modes**:

1. **FileMaker WebViewer** (local file mode)
2. **Web Browser** (hosted/PWA mode)

## How It Works

### Mode 1: FileMaker WebViewer (Local File)

When `index.html` is loaded in FileMaker WebViewer:

- ✅ App loads and works normally
- ✅ **Firebase Firestore offline cache** works (data persistence)
- ❌ Service Worker won't register (not supported in WebViewer)
- ℹ️ This is expected and **the app works perfectly** without the service worker

**Console Log:**

```
[App] Service Worker not supported in this context (FileMaker WebViewer mode)
```

### Mode 2: Web Browser / Hosted (PWA)

When hosted on HTTPS and loaded in a browser:

- ✅ App loads and works normally
- ✅ **Firebase Firestore offline cache** works (data persistence)
- ✅ **Service Worker** registers and caches the app
- ✅ **Full offline PWA** experience
- ✅ App can be installed on device
- ✅ Works completely offline after first visit

**Console Log:**

```
[App] Service Worker registered successfully: https://yourdomain.com/
[SW] Installing service worker...
[SW] Caching app shell
[SW] Installation complete
```

## What Gets Cached

The service worker caches:

- `/index.html` (your entire app - single file!)
- `/favicon.ico`
- `/manifest.json`

That's it! Super simple because of the single-file build.

## Files Added

1. **`/public/sw.js`** - Service worker (separate file, required by browsers)
2. **`/public/manifest.json`** - PWA manifest for installability
3. **Updates to `src/main.js`** - Service worker registration with feature detection
4. **Updates to `index.html`** - PWA meta tags and manifest link
5. **Updates to `vite.config.js`** - Ensures files are copied to dist

## Build Output

After running `npm run build`, your `/dist` folder contains:

```
dist/
  ├── index.html      (your entire app - single file)
  ├── sw.js           (service worker)
  ├── manifest.json   (PWA manifest)
  └── favicon.ico     (icon)
```

## Deployment

### For FileMaker WebViewer:

Just use `dist/index.html` as before - nothing changes! The service worker registration fails gracefully.

### For Web Hosting (PWA):

1. Upload the entire `/dist` folder to your web server
2. Ensure HTTPS is enabled
3. Access your app - service worker will register automatically
4. After first visit, app works completely offline
5. Users can "install" the app on their devices

## Testing Offline Mode

### In Browser (PWA mode):

1. Build: `npm run build`
2. Serve: `npm run preview` (or deploy to web server)
3. Open in browser and check console for `[SW] Installing service worker...`
4. Open DevTools → Application → Service Workers (should show registered)
5. Enable "Offline" in Network tab
6. Refresh page - app still works!

### In FileMaker WebViewer:

1. Build: `npm run build`
2. Load `dist/index.html` in WebViewer
3. Check console - should see `Service Worker not supported` message
4. App works normally with Firebase offline cache

## Firebase Offline Persistence

**Both modes** benefit from Firebase Firestore's built-in offline persistence:

```javascript
// Already configured in firebaseInit.js
initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache(),
})
```

This means:

- ✅ Data writes are queued when offline
- ✅ Data reads come from local cache when offline
- ✅ Auto-syncs when connection restored
- ✅ Works in **both FileMaker WebViewer AND browser modes**

## Updating the App

When you deploy a new version:

1. Service worker detects the update
2. Logs: `[App] New service worker available - reload to update`
3. User refreshes to get the new version
4. Old cache is automatically cleared

## Troubleshooting

### Service Worker Not Registering in Browser

- Ensure you're using HTTPS (or localhost)
- Check console for errors
- Verify `sw.js` is accessible at `/sw.js`

### App Not Working Offline

- First visit must be online to cache the app
- Check Application → Cache Storage in DevTools
- Verify Firestore offline cache is enabled

### FileMaker WebViewer Issues

- Service worker failure is **expected and normal**
- App should still work with Firebase offline cache
- Check that Firebase initialization succeeded

## Benefits

✅ **Simple single-file caching** - only one HTML file to cache  
✅ **Progressive enhancement** - works everywhere, enhanced in browsers  
✅ **True offline-first** - Firebase + Service Worker = full offline  
✅ **Installable PWA** - users can add to home screen  
✅ **FileMaker compatible** - no changes needed for WebViewer deployment

## Cache Updates

The service worker checks for updates:

- On page load
- Every 60 seconds (automatic check)
- When explicitly triggered

To force update: Reload the page after seeing the update message.

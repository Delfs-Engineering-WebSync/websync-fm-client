;(function setupFileMakerConsoleBridge() {
  const globalScope =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
        ? globalThis
        : undefined
  if (!globalScope) return

  let applied = !!globalScope.__fileMakerConsoleBridgeApplied
  const originalLog = console.log.__fileMakerOriginal || console.log.bind(console)

  function serializeArgs(args) {
    try {
      return JSON.stringify(args)
    } catch {
      try {
        return JSON.stringify(
          args.map((value) => {
            if (value instanceof Error) {
              return { name: value.name, message: value.message, stack: value.stack }
            }
            const type = typeof value
            if (value === null || type === 'string' || type === 'number' || type === 'boolean') {
              return value
            }
            try {
              return JSON.parse(JSON.stringify(value))
            } catch {
              return Object.prototype.toString.call(value)
            }
          }),
        )
      } catch {
        try {
          return JSON.stringify(args.map((v) => String(v)))
        } catch {
          return '[]'
        }
      }
    }
  }

  function applyBridge() {
    if (applied) return
    const patched = function fileMakerMirroredConsoleLog(...args) {
      originalLog(...args)
      try {
        if (globalScope.FileMaker && typeof globalScope.FileMaker.PerformScript === 'function') {
          const payload = serializeArgs(args)
          globalScope.FileMaker.PerformScript('DebugLog', payload)
        }
      } catch (bridgeError) {
        try {
          originalLog('[FileMaker Console Bridge] Error sending to FileMaker:', bridgeError)
        } catch {
          // no-op
        }
      }
    }
    patched.__fileMakerOriginal = originalLog
    console.log = patched
    applied = true
    globalScope.__fileMakerConsoleBridgeApplied = true
  }

  function removeBridge() {
    if (!applied) return
    try {
      const orig = console.log.__fileMakerOriginal || originalLog
      console.log = orig
    } catch { /* noop */ void 0 }
    applied = false
    globalScope.__fileMakerConsoleBridgeApplied = false
  }

  globalScope.enableFileMakerConsoleBridge = function enableFileMakerConsoleBridge() {
    applyBridge()
  }
  globalScope.disableFileMakerConsoleBridge = function disableFileMakerConsoleBridge() {
    removeBridge()
  }

  let shouldEnable = false
  try {
    shouldEnable =
      !!globalScope.__fileMakerConsoleBridgeEnabled ||
      (globalScope.localStorage && globalScope.localStorage.getItem('fmLog') === '1') ||
      (globalScope.location && new URL(globalScope.location.href).searchParams.get('fmLog') === '1')
  } catch { /* noop */ void 0 }

  if (shouldEnable) {
    applyBridge()
  }
})()

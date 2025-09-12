;(function setupFileMakerConsoleBridge() {
  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)
  if (!globalScope) return
  if (globalScope.__fileMakerConsoleBridgeApplied) return

  const originalLog = console.log.bind(console)

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
          })
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

  console.log = function fileMakerMirroredConsoleLog(...args) {
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

  // Expose a reference to the original method for debugging and idempotency
  console.log.__fileMakerOriginal = originalLog
  globalScope.__fileMakerConsoleBridgeApplied = true
})()



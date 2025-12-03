let loggerInstalled = false
let storeRef = null
const bufferedEntries = []
const BUFFER_LIMIT = 1000
const METHODS = ['log', 'info', 'warn', 'error']

function formatArgs(args) {
  try {
    return args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}`
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg)
          } catch {
            return Object.prototype.toString.call(arg)
          }
        }
        if (typeof arg === 'undefined') return 'undefined'
        return String(arg)
      })
      .join(' ')
  } catch {
    return '[unserializable log arguments]'
  }
}

function getPersistedEnabledFlag() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('ws-dev-logs-enabled') === '1'
    }
  } catch {
    /* storage unavailable */
  }
  return false
}

function isLoggingEnabled() {
  if (storeRef) return !!storeRef.devLoggingEnabled
  return getPersistedEnabledFlag()
}

function recordEntry(entry) {
  if (!isLoggingEnabled()) return
  if (storeRef && typeof storeRef.addDevLogEntry === 'function') {
    storeRef.addDevLogEntry(entry)
    return
  }
  bufferedEntries.push(entry)
  if (bufferedEntries.length > BUFFER_LIMIT) {
    bufferedEntries.splice(0, bufferedEntries.length - BUFFER_LIMIT)
  }
}

export function connectDevLoggerStore(store) {
  storeRef = store
  if (!storeRef) return
  if (typeof storeRef.initializeDevLoggingSettings === 'function') {
    storeRef.initializeDevLoggingSettings()
  }
  if (!storeRef.devLoggingEnabled) {
    bufferedEntries.length = 0
    return
  }
  bufferedEntries.forEach((entry) => storeRef.addDevLogEntry(entry))
  bufferedEntries.length = 0
}

export function installDevLogger() {
  if (loggerInstalled || typeof console === 'undefined') return
  METHODS.forEach((method) => {
    const original = console[method]
    if (typeof original !== 'function') return
    if (original.__wsDevLoggerPatched) return

    const patched = function (...args) {
      try {
        recordEntry({
          level: method,
          message: formatArgs(args),
        })
      } catch {
        /* swallow logger errors */
      }
      return original.apply(this, args)
    }

    patched.__wsDevLoggerPatched = true
    patched.__wsDevLoggerOriginal = original
    console[method] = patched
  })
  loggerInstalled = true
}

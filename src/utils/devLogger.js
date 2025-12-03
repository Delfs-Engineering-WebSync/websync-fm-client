import { useAppConfigStore } from '../stores/appConfig'

let loggerInstalled = false
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

export function installDevLogger() {
  if (loggerInstalled) return
  const store = useAppConfigStore()
  METHODS.forEach((method) => {
    const original = console[method]
    if (typeof original !== 'function') return
    if (original.__wsDevLoggerPatched) return

    const patched = function (...args) {
      try {
        if (store?.devLoggingEnabled) {
          store.addDevLogEntry({
            level: method,
            message: formatArgs(args),
          })
        }
      } catch {
        // Swallow logging errors so we never break console output
      }
      return original.apply(this, args)
    }

    patched.__wsDevLoggerPatched = true
    patched.__wsDevLoggerOriginal = original
    console[method] = patched
  })
  loggerInstalled = true
}


// FileMaker Bridge - Equivalent to BetterForms FM Bridgit
// This provides FileMaker communication capabilities or mocks for standalone use

class FileMakerBridge {
  constructor() {
    this._q = {}
    this._counter = 0
    this._fireAndForgetIds = new Set()

    // Global error handler for unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        // console.warn(`[FileMaker Bridge] Unhandled Promise Rejection: ${event.reason}`)
        // console.warn(
        //   `[FileMaker Bridge] This is likely a FileMaker callback error that we're now handling gracefully`,
        // )
        event.preventDefault() // Prevent the default unhandled rejection behavior
      })
    }
  }

  // Check if FileMaker is available (dynamic check)
  get isFileMakerEnvironment() {
    return typeof window !== 'undefined' && typeof window.FileMaker !== 'undefined'
  }

  // Equivalent to BF.namedAction but for FileMaker scripts
  async performScript(scriptName, parameter = '', options = {}) {
    // Always try to wait for FileMaker first (up to 2 seconds)
    if (typeof window !== 'undefined') {
      let delay = 0
      const maxDelay = 20 // 20 * 100ms = 2 seconds

      // Wait for FileMaker to be injected
      while (typeof window.FileMaker === 'undefined' && delay < maxDelay) {
        delay += 1
        await this._sleep(100)
      }

      // If FileMaker is now available, use real FileMaker
      if (typeof window.FileMaker !== 'undefined') {
        const id = this._counter++
        const param = {
          id: id,
          scriptParameter: parameter,
          scriptName: scriptName,
        }

        // console.log(`[FileMaker Bridge] Creating FileMaker operation with ID: ${id}`)
        // console.log(`[FileMaker Bridge] Script: ${scriptName}`)
        // console.log(`[FileMaker Bridge] Parameter:`, parameter)
        if (options && options.fireAndForget) {
          // console.log(`[FileMaker Bridge] Marking operation ${id} as fire-and-forget`)
          this._fireAndForgetIds.add(String(id))
        }

        try {
          if (typeof window.FileMaker.PerformScriptWithOption === 'function') {
            // console.log('[FileMaker Bridge] Using PerformScriptWithOption')
            window.FileMaker.PerformScriptWithOption(
              '_fmBridgit.webhook',
              JSON.stringify(param),
              '0', // Continue: queue after current script
            )
          } else if (typeof window.FileMaker.PerformScriptWithOptions === 'function') {
            // console.log('[FileMaker Bridge] Using PerformScriptWithOptions')
            window.FileMaker.PerformScriptWithOptions(
              '_fmBridgit.webhook',
              JSON.stringify(param),
              '0',
            )
          } else {
            // console.log('[FileMaker Bridge] Using legacy PerformScript')
            window.FileMaker.PerformScript('_fmBridgit.webhook', JSON.stringify(param))
          }
          const promise = this._registerPromise(id)
          // console.log(`[FileMaker Bridge] FileMaker operation ${id} initiated, promise created`)
          return promise
        } catch (error) {
          console.error('Error performing FileMaker script:', error)
          throw error
        }
      } else {
        // FileMaker not available after 2 seconds - log error and fall back to mock
        // console.error(
        //   `[FileMaker Bridge] FileMaker not available after 2 seconds. Falling back to mock for script: ${scriptName}`,
        // )
      }
    }

    // Mock for standalone development
    console.log(`[FileMaker Mock] Script: ${scriptName}`)

    // Parse parameter if it's a JSON string
    let parsedParam = parameter
    try {
      if (typeof parameter === 'string' && parameter.startsWith('{')) {
        parsedParam = JSON.parse(parameter)
      }
    } catch {
      // Keep original parameter if parsing fails
    }

    // Simulate some common script responses
    switch (scriptName) {
      case 'API - Web Sync Inbound dispatcher {payload}':
        // Main script for processing updates from cloud
        console.log(
          `[FileMaker Mock] Processing ${parsedParam?.updates?.length || 0} updates, ${parsedParam?.remaining || 0} remaining`,
        )
        return {
          success: true,
          message: `Processed ${parsedParam?.updates?.length || 0} updates successfully (mocked)`,
          data: { recordsProcessed: parsedParam?.updates?.length || 0 },
        }
      case 'API - Upload Complete Callback':
        return { success: true, message: 'Upload completed (mocked)' }
      case '_fmBridgit.webhook':
        // FileMaker callback webhook
        return { success: true, message: 'Webhook received (mocked)' }
      case '_fmBridgit.returnResult':
        return { success: true, data: parameter }
      default:
        console.log(`[FileMaker Mock] Unknown script: ${scriptName}`)
        return { success: true, message: `Script ${scriptName} executed (mocked)` }
    }
  }

  // Callback handler for FileMaker responses
  callback(param) {
    // console.log('[FileMaker Bridge] Callback received:', param)
    try {
      const data = JSON.parse(param)
      // console.log('[FileMaker Bridge] Parsed callback data:', data)
      // console.log('[FileMaker Bridge] Looking for promise with ID:', data.id)
      // console.log('[FileMaker Bridge] Active promises:', Object.keys(this._q))

      // Enhanced logging for error analysis
      if (data.error) {
        // console.error(`[FileMaker Bridge] ERROR CALLBACK for ID ${data.id}:`, data.error)
        // console.error(`[FileMaker Bridge] Error type: ${typeof data.error}`)
        // console.error(`[FileMaker Bridge] Error value: ${data.error}`)
        if (data.error_message) {
          // console.error(`[FileMaker Bridge] Error message: ${data.error_message}`)
        }
        // console.error(`[FileMaker Bridge] Full callback data:`, data)
      } else if (data.success) {
        // console.log(`[FileMaker Bridge] SUCCESS CALLBACK for ID ${data.id}:`, data.success)
        // console.log(`[FileMaker Bridge] Success type: ${typeof data.success}`)
        // console.log(`[FileMaker Bridge] Success value:`, data.success)
      } else {
        // console.warn(`[FileMaker Bridge] NEUTRAL CALLBACK for ID ${data.id} - no success or error`)
        // console.warn(`[FileMaker Bridge] Full callback data:`, data)
      }

      // Normalize error payloads coming from FileMaker. Some scripts return
      // { error: 1, error_message: "..." } while _fmBridgit.webhook may wrap
      // the entire JSON as a string in the "error" field. Handle both.
      let errorPayload = null
      if (data.error) {
        if (typeof data.error === 'object') {
          errorPayload = {
            code: data.error.code ?? data.error.error ?? '1',
            message: data.error.message ?? data.error.error_message,
            raw: data.error,
          }
        } else if (typeof data.error === 'string') {
          let parsed = null
          const text = data.error != null ? String(data.error).trim() : ''
          // Only attempt to parse if it looks like JSON (starts with { or [)
          if (text.startsWith('{') || text.startsWith('[')) {
            try {
              parsed = JSON.parse(text)
            } catch {
              // console.warn('[FileMaker Bridge] Failed to parse error JSON')
            }
          }
          if (parsed && typeof parsed === 'object') {
            errorPayload = {
              code: parsed.code ?? parsed.error ?? data.error,
              message: parsed.message ?? parsed.error_message,
              raw: parsed,
            }
          } else {
            errorPayload = { code: data.error, message: data.error_message }
          }
        } else {
          errorPayload = { code: String(data.error), message: data.error_message }
        }
      }

      this._applyPromise(data.id, data.success, errorPayload)
    } catch {
      // console.error('[FileMaker Bridge] Error in callback')
      // console.error('[FileMaker Bridge] Raw param was:', param)
    }
  }

  // Return result to FileMaker
  returnResult(param) {
    // console.log(`[FileMaker Bridge] returnResult called with:`, param)
    const result = this.performScript('_fmBridgit.returnResult', JSON.stringify(param), {
      fireAndForget: true,
    })
    // console.log(`[FileMaker Bridge] returnResult result:`, result)
    return result
  }

  // Private methods
  _registerPromise(id) {
    // console.log(`[FileMaker Bridge] Creating promise with ID: ${id}`)
    // console.log(`[FileMaker Bridge] Current promise queue:`, Object.keys(this._q))
    return new Promise((resolve, reject) => {
      this._q[id] = { resolve, reject }
      // console.log(
      //   `[FileMaker Bridge] Promise ${id} registered, total promises:`,
      //   Object.keys(this._q).length,
      // )
    })
  }

  _applyPromise(id, success, error) {
    // console.log(`[FileMaker Bridge] Applying promise for ID: ${id}`)
    // console.log(`[FileMaker Bridge] Success value: ${JSON.stringify(success)}`)
    // console.log(`[FileMaker Bridge] Error value: ${JSON.stringify(error)}`)

    const deferred = this._q[id]
    if (deferred) {
      // console.log(`[FileMaker Bridge] Found promise for ID: ${id}, processing...`)

      if (success) {
        // console.log(`[FileMaker Bridge] Resolving promise ${id} with success:`, success)
        deferred.resolve(success)
      } else if (error) {
        if (this._fireAndForgetIds.has(String(id))) {
          // console.warn(
          //   `[FileMaker Bridge] Fire-and-forget promise ${id} received error '${error}', resolving true`,
          // )
          this._fireAndForgetIds.delete(String(id))
          deferred.resolve(true)
        } else {
          // console.error(`[FileMaker Bridge] Rejecting promise ${id} with error:`, error)
          // console.error(`[FileMaker Bridge] Error type: ${typeof error}`)
          deferred.reject(error)
        }
      } else {
        // If neither success nor error, resolve with true
        // console.log(
        //   `[FileMaker Bridge] Resolving promise ${id} with default true (no success/error)`,
        // )
        deferred.resolve(true)
      }

      delete this._q[id]
      // console.log(`[FileMaker Bridge] Promise ${id} processed and removed from queue`)
      // console.log(`[FileMaker Bridge] Remaining promises: ${Object.keys(this._q)}`)
    } else {
      // console.warn(`[FileMaker Bridge] No promise found for ID: ${id}`)
      // console.warn(`[FileMaker Bridge] Available IDs: ${Object.keys(this._q)}`)
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Test function to simulate FileMaker callback (for debugging)
  testCallback(id, success = true, data = null) {
    // console.log('[FileMaker Bridge] Testing callback for ID:', id)
    const callbackData = {
      id: id,
      success: success ? data || { message: 'Test callback successful' } : null,
      error: success ? null : data || 'Test error',
    }
    this.callback(JSON.stringify(callbackData))
  }
}

// Create global instance (equivalent to window.fmBridgit)
export const fmBridgit = new FileMakerBridge()

// Make it available globally for compatibility
if (typeof window !== 'undefined') {
  window.fmBridgit = fmBridgit
}

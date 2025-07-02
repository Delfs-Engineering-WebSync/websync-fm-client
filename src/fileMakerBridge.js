// FileMaker Bridge - Equivalent to BetterForms FM Bridgit
// This provides FileMaker communication capabilities or mocks for standalone use

class FileMakerBridge {
  constructor() {
    this._q = {}
    this._counter = 0
  }

  // Check if FileMaker is available (dynamic check)
  get isFileMakerEnvironment() {
    return typeof window !== 'undefined' && typeof window.FileMaker !== 'undefined'
  }

  // Equivalent to BF.namedAction but for FileMaker scripts
  async performScript(scriptName, parameter = '') {
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

        try {
          window.FileMaker.PerformScript('_fmBridgit.webhook', JSON.stringify(param))
          return this._registerPromise(id)
        } catch (error) {
          console.error('Error performing FileMaker script:', error)
          throw error
        }
      } else {
        // FileMaker not available after 2 seconds - log error and fall back to mock
        console.error(
          `[FileMaker Bridge] FileMaker not available after 2 seconds. Falling back to mock for script: ${scriptName}`,
        )
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
    console.log('[FileMaker Bridge] Callback received:', param)
    try {
      const data = JSON.parse(param)
      console.log('[FileMaker Bridge] Parsed callback data:', data)
      console.log('[FileMaker Bridge] Looking for promise with ID:', data.id)
      console.log('[FileMaker Bridge] Active promises:', Object.keys(this._q))

      this._applyPromise(data.id, data.success, data.error)
    } catch (error) {
      console.error('[FileMaker Bridge] Error in callback:', error)
      console.error('[FileMaker Bridge] Raw param was:', param)
    }
  }

  // Return result to FileMaker
  returnResult(param) {
    return this.performScript('_fmBridgit.returnResult', JSON.stringify(param))
  }

  // Private methods
  _registerPromise(id) {
    return new Promise((resolve, reject) => {
      this._q[id] = { resolve, reject }
    })
  }

  _applyPromise(id, success, error) {
    console.log('[FileMaker Bridge] Applying promise for ID:', id)
    const deferred = this._q[id]
    if (deferred) {
      console.log('[FileMaker Bridge] Found promise, resolving with:', success || error)
      if (success) {
        deferred.resolve(success)
      } else if (error) {
        deferred.reject(error)
      } else {
        // If neither success nor error, resolve with true
        deferred.resolve(true)
      }
      delete this._q[id]
      console.log('[FileMaker Bridge] Promise resolved and removed from queue')
    } else {
      console.warn('[FileMaker Bridge] No promise found for ID:', id)
      console.warn('[FileMaker Bridge] Available IDs:', Object.keys(this._q))
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Test function to simulate FileMaker callback (for debugging)
  testCallback(id, success = true, data = null) {
    console.log('[FileMaker Bridge] Testing callback for ID:', id)
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

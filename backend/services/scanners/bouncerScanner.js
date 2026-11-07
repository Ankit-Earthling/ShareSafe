import { Bouncer } from '@usebouncer/sdk'
import { env } from '../../config/env.js'
import { storagePath } from '../fileStorage.js'

const SCAN_TIMEOUT_MS = 120000

/**
 * Adapt Bouncer's completed scan result to ShareSafe's fail-closed scanner contract.
 * SDK errors are deliberately replaced with safe errors: provider response bodies,
 * signed upload fields, and credentials must never reach application logs or clients.
 */
export function createBouncerScanner({
  apiKey = env.bouncerApiKey,
  BouncerClient = Bouncer,
  clientOptions = {},
  waitTimeoutMs = SCAN_TIMEOUT_MS,
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('BOUNCER_API_KEY is required when MALWARE_SCANNER=bouncer.')
  }

  const client = new BouncerClient(apiKey, {
    timeoutMs: 15000,
    uploadTimeoutMs: SCAN_TIMEOUT_MS,
    maxRetries: 2,
    ...clientOptions,
  })

  return async (storageKey) => {
    let result
    try {
      result = await client.scan(storagePath(storageKey), { waitTimeoutMs })
    } catch {
      throw new Error('Bouncer malware scanning did not complete.')
    }

    if (!result || result.status !== 'completed') return 'failed'
    if (result.verdict === 'clean') return 'clean'
    if (result.verdict === 'malicious') return 'infected'
    if (result.verdict === 'suspicious') return 'suspicious'
    return 'failed'
  }
}

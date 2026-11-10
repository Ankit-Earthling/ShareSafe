import { env } from '../../config/env.js'
import { createClamAvScanner } from './clamavScanner.js'

export const scanStoredFile = createClamAvScanner({
  host: env.clamavHost,
  port: env.clamavPort,
  connectTimeoutMs: env.clamavConnectTimeoutMs,
  timeoutMs: env.clamavTimeoutMs,
})

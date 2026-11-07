import { env } from '../../config/env.js'
import { createBouncerScanner } from './bouncerScanner.js'
import { scanWithClamAv } from './clamavScanner.js'

export const scanStoredFile = env.malwareScanner === 'bouncer' ? createBouncerScanner() : scanWithClamAv

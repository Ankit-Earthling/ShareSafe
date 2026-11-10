import { databaseIsConnected } from '../config/database.js'
import { env } from '../config/env.js'
import { scanStoredFile } from '../services/scanners/index.js'
import { localStorage } from '../services/storage/localStorage.js'

export function getHealth(_request, response) {
  return response.status(200).json({ status: 'ok' })
}

async function checkConfiguredStorage({ storageDriver, signal }) {
  if (storageDriver === 'local') {
    await localStorage.check()
    return 'local'
  }

  if (storageDriver === 'b2') {
    const { backblazeB2Storage } = await import('../services/storage/backblazeB2Client.js')
    if (!backblazeB2Storage) throw new Error('Configured storage adapter is unavailable.')
    await backblazeB2Storage.check({ signal })
    return 'connected'
  }

  throw new Error('Configured storage adapter is unavailable.')
}

export function createReadinessHandler({
  isDatabaseConnected = databaseIsConnected,
  storageDriver = env.storageDriver,
  storageCheck = ({ signal } = {}) => checkConfiguredStorage({ storageDriver, signal }),
  scannerCheck = scanStoredFile.check,
  storageTimeoutMs = 5000,
} = {}) {
  return async function getReadiness(_request, response) {
    const databaseConnected = isDatabaseConnected()
    let storage = 'disconnected'
    let scanner = 'disconnected'

    if (databaseConnected) {
      const storageTimeout = new AbortController()
      const timer = setTimeout(() => storageTimeout.abort(), storageTimeoutMs)
      try {
        storage = await storageCheck({ signal: storageTimeout.signal })
      } catch {
        storage = 'disconnected'
      } finally {
        clearTimeout(timer)
      }

      try {
        await scannerCheck()
        scanner = 'connected'
      } catch {
        scanner = 'disconnected'
      }
    }

    const healthy = databaseConnected && storage !== 'disconnected' && scanner === 'connected'
    response.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      database: databaseConnected ? 'connected' : 'disconnected',
      storage,
      scanner,
    })
  }
}

export const getReadiness = createReadinessHandler()

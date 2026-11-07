import { databaseIsConnected } from '../config/database.js'
import { env } from '../config/env.js'
import { backblazeB2Storage } from '../services/storage/backblazeB2Client.js'

export function createHealthHandler({
  isDatabaseConnected = databaseIsConnected,
  storageDriver = env.storageDriver,
  malwareScanner = env.malwareScanner,
  storageAdapter = backblazeB2Storage,
  storageTimeoutMs = 2500,
} = {}) {
  return async function getHealth(_request, response) {
    const databaseConnected = isDatabaseConnected()
    let storage = storageDriver === 'local' ? 'local' : 'disconnected'
    if (databaseConnected && storageAdapter) {
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), storageTimeoutMs)
      try {
        await storageAdapter.check({ signal: timeout.signal })
        storage = 'connected'
      } catch {
        storage = 'disconnected'
      } finally {
        clearTimeout(timer)
      }
    }
    const healthy = databaseConnected && storage !== 'disconnected'
    response.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      database: databaseConnected ? 'connected' : 'disconnected',
      storage,
      scanner: malwareScanner,
    })
  }
}

export const getHealth = createHealthHandler()

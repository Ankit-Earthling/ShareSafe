import { databaseIsConnected } from '../config/database.js'
import { env } from '../config/env.js'
import { backblazeB2Storage } from '../services/storage/backblazeB2Client.js'

export async function getHealth(_request, response) {
  const databaseConnected = databaseIsConnected()
  let storage = env.storageDriver === 'local' ? 'local' : 'disconnected'
  if (databaseConnected && backblazeB2Storage) {
    try {
      await backblazeB2Storage.check()
      storage = 'connected'
    } catch {
      storage = 'disconnected'
    }
  }
  const healthy = databaseConnected && storage !== 'disconnected'
  response.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected',
    storage,
    scanner: env.malwareScanner,
  })
}

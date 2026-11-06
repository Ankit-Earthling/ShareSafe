import { databaseIsConnected } from '../config/database.js'

export function getHealth(_request, response) {
  const connected = databaseIsConnected()
  response.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'disconnected',
  })
}

import { Router } from 'express'
import { getReadiness } from '../controllers/healthController.js'

export function createReadinessRoutes(handler = getReadiness, rateLimiter) {
  const readinessRoutes = Router()
  if (rateLimiter) readinessRoutes.get('/ready', rateLimiter, handler)
  else readinessRoutes.get('/ready', handler)
  return readinessRoutes
}

export default createReadinessRoutes()

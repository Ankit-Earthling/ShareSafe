import { Router } from 'express'
import { getReadiness } from '../controllers/healthController.js'

export function createReadinessRoutes(handler = getReadiness) {
  const readinessRoutes = Router()
  readinessRoutes.get('/ready', handler)
  return readinessRoutes
}

export default createReadinessRoutes()

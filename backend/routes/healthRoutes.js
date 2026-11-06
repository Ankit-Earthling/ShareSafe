import { Router } from 'express'
import { getHealth } from '../controllers/healthController.js'

const healthRoutes = Router()
healthRoutes.get('/health', getHealth)

export default healthRoutes

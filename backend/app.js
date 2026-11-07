import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'
import apiRoutes from './routes/apiRoutes.js'
import healthRoutes from './routes/healthRoutes.js'
import { createReadinessRoutes } from './routes/readinessRoutes.js'
import { getReadiness } from './controllers/healthController.js'
import { scanStoredFile } from './services/scanners/index.js'
import { publicApiRateLimiter } from './middleware/rateLimiters.js'

export function createApp({ scanFile = scanStoredFile, readinessHandler = getReadiness } = {}) {
  const app = express()
  app.locals.scanFile = scanFile

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin: env.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-ShareSafe-Link-Id', 'X-ShareSafe-Accessed-At', 'X-ShareSafe-Viewer'],
  }))
  // Liveness is local-only and stays ahead of dependency checks and API limits.
  app.use('/api', healthRoutes)
  app.use(express.json({ limit: '16kb' }))
  app.use(cookieParser())
  app.use('/api', createReadinessRoutes(readinessHandler, publicApiRateLimiter))
  app.use('/api', apiRoutes)
  app.use(notFound)
  app.use(errorHandler)

  return app
}

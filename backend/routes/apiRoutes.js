import { Router } from 'express'
import { notFound } from '../middleware/notFound.js'
import authRoutes from './authRoutes.js'
import fileRoutes from './fileRoutes.js'
import shareRoutes, { publicShareRoutes } from './shareRoutes.js'

const apiRoutes = Router()
apiRoutes.use('/auth', authRoutes)
apiRoutes.use('/public/shares', publicShareRoutes)
// Authentication is scoped to known private API groups so unknown API paths
// reach the JSON 404 handler instead of being mistaken for protected routes.
apiRoutes.use('/files', fileRoutes)
apiRoutes.use('/shares', shareRoutes)
apiRoutes.use(notFound)

export default apiRoutes

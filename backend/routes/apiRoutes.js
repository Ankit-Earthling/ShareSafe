import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import authRoutes from './authRoutes.js'
import fileRoutes from './fileRoutes.js'
import healthRoutes from './healthRoutes.js'
import shareRoutes, { publicShareRoutes } from './shareRoutes.js'

const apiRoutes = Router()
apiRoutes.use(healthRoutes)
apiRoutes.use('/auth', authRoutes)
apiRoutes.use('/public/shares', publicShareRoutes)
// Routes mounted after this middleware require an authenticated user by default.
apiRoutes.use(authenticate)
apiRoutes.use('/files', fileRoutes)
apiRoutes.use('/shares', shareRoutes)

export default apiRoutes

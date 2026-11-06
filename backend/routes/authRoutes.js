import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getCurrentUser, login, logout, register } from '../controllers/authController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireFrontendOrigin } from '../middleware/requireFrontendOrigin.js'

const authRoutes = Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ message: 'Too many login attempts. Please try again later.' }),
})

authRoutes.post('/register', requireFrontendOrigin, register)
authRoutes.post('/login', requireFrontendOrigin, loginLimiter, login)
authRoutes.post('/logout', requireFrontendOrigin, logout)
authRoutes.get('/me', authenticate, getCurrentUser)

export default authRoutes

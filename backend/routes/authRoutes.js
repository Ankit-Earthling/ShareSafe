import { Router } from 'express'
import { getCurrentUser, login, logout, register } from '../controllers/authController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireFrontendOrigin } from '../middleware/requireFrontendOrigin.js'
import { authenticatedApiRateLimiter, loginRateLimiter, publicApiRateLimiter, registrationRateLimiter } from '../middleware/rateLimiters.js'

const authRoutes = Router()
authRoutes.post('/register', publicApiRateLimiter, requireFrontendOrigin, registrationRateLimiter, register)
authRoutes.post('/login', publicApiRateLimiter, requireFrontendOrigin, loginRateLimiter, login)
authRoutes.post('/logout', publicApiRateLimiter, requireFrontendOrigin, logout)
authRoutes.get('/me', authenticate, authenticatedApiRateLimiter, getCurrentUser)

export default authRoutes

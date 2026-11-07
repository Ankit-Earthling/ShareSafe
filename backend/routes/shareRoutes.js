import { Router } from 'express'
import { accessPublicShare, createShare, getPublicShare, getShareHistory, listShares, previewPublicShare, revokeShare } from '../controllers/shareController.js'
import { requireFrontendOrigin } from '../middleware/requireFrontendOrigin.js'
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js'
import { authenticatedApiRateLimiter, publicApiRateLimiter, publicShareRateLimiter } from '../middleware/rateLimiters.js'

const shareRoutes = Router()
export const publicShareRoutes = Router()
publicShareRoutes.use(publicApiRateLimiter)
publicShareRoutes.use(optionalAuthenticate)
publicShareRoutes.get('/:token', publicShareRateLimiter, getPublicShare)
publicShareRoutes.post('/:token/access', publicShareRateLimiter, accessPublicShare)
publicShareRoutes.post('/:token/preview', publicShareRateLimiter, previewPublicShare)

shareRoutes.post('/', authenticate, authenticatedApiRateLimiter, requireFrontendOrigin, createShare)
shareRoutes.get('/', authenticate, authenticatedApiRateLimiter, listShares)
shareRoutes.get('/:id/history', authenticate, authenticatedApiRateLimiter, getShareHistory)
shareRoutes.delete('/:id', authenticate, authenticatedApiRateLimiter, requireFrontendOrigin, revokeShare)

export default shareRoutes

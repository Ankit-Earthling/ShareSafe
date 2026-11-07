import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { accessPublicShare, createShare, getPublicShare, getShareHistory, listShares, previewPublicShare, revokeShare } from '../controllers/shareController.js'
import { requireFrontendOrigin } from '../middleware/requireFrontendOrigin.js'
import { optionalAuthenticate } from '../middleware/authenticate.js'

const shareRoutes = Router()
const publicAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ message: 'Too many sharing link attempts. Please try again later.' }),
})
export const publicShareRoutes = Router()
publicShareRoutes.use(optionalAuthenticate)
publicShareRoutes.get('/:token', publicAccessLimiter, getPublicShare)
publicShareRoutes.post('/:token/access', publicAccessLimiter, accessPublicShare)
publicShareRoutes.post('/:token/preview', publicAccessLimiter, previewPublicShare)

shareRoutes.post('/', requireFrontendOrigin, createShare)
shareRoutes.get('/', listShares)
shareRoutes.get('/:id/history', getShareHistory)
shareRoutes.delete('/:id', requireFrontendOrigin, revokeShare)

export default shareRoutes

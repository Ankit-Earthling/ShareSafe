import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { accessPublicShare, createShare, getPublicShare, listShares, revokeShare } from '../controllers/shareController.js'
import { requireFrontendOrigin } from '../middleware/requireFrontendOrigin.js'

const shareRoutes = Router()
const publicAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ message: 'Too many sharing link attempts. Please try again later.' }),
})
export const publicShareRoutes = Router()
publicShareRoutes.get('/:token', publicAccessLimiter, getPublicShare)
publicShareRoutes.post('/:token/access', publicAccessLimiter, accessPublicShare)

shareRoutes.post('/', requireFrontendOrigin, createShare)
shareRoutes.get('/', listShares)
shareRoutes.delete('/:id', requireFrontendOrigin, revokeShare)

export default shareRoutes

import { createAuthenticatedRateLimiter, createIpRateLimiter } from './ipRateLimiter.js'

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMITS = Object.freeze({
  api: 120,
  authenticatedApi: 120,
  login: 10,
  registration: 10,
  publicShare: 30,
})

function commonOptions(limit) {
  return {
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }
}

export const publicApiRateLimiter = createIpRateLimiter(commonOptions(RATE_LIMITS.api))
export const unauthenticatedApiRateLimiter = createIpRateLimiter(commonOptions(RATE_LIMITS.api))
export const authenticatedApiRateLimiter = createAuthenticatedRateLimiter(commonOptions(RATE_LIMITS.authenticatedApi))
export const registrationRateLimiter = createIpRateLimiter({
  ...commonOptions(RATE_LIMITS.registration),
  handler: (_request, response) => response.status(429).json({ message: 'Too many registration attempts. Please try again later.' }),
})
export const loginRateLimiter = createIpRateLimiter({
  ...commonOptions(RATE_LIMITS.login),
  handler: (_request, response) => response.status(429).json({ message: 'Too many login attempts. Please try again later.' }),
})
export const publicShareRateLimiter = createIpRateLimiter({
  ...commonOptions(RATE_LIMITS.publicShare),
  handler: (_request, response) => response.status(429).json({ message: 'Too many sharing link attempts. Please try again later.' }),
})

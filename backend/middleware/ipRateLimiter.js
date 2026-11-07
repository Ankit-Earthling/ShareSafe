import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

export function rateLimitClientKey(request) {
  const peerAddress = request.socket.remoteAddress
  return peerAddress ? ipKeyGenerator(peerAddress) : 'unknown-client'
}

export function rateLimitAuthenticatedUserKey(request) {
  const userId = request.user?._id?.toString() || request.user?.id
  return userId ? `user:${userId}` : `peer:${rateLimitClientKey(request)}`
}

export function createIpRateLimiter(options) {
  return rateLimit({ ...options, keyGenerator: rateLimitClientKey })
}

export function createAuthenticatedRateLimiter(options) {
  return rateLimit({ ...options, keyGenerator: rateLimitAuthenticatedUserKey })
}

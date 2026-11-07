import mongoose from 'mongoose'
import { getUserById } from '../services/authService.js'
import { unauthenticatedApiRateLimiter } from './rateLimiters.js'
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/authToken.js'

function rejectAuthentication(request, response, status, message) {
  return unauthenticatedApiRateLimiter(request, response, () => response.status(status).json({ message }))
}

function getRequestToken(request) {
  const authorization = request.get('authorization')
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    return match?.[1]
  }
  return request.cookies?.[AUTH_COOKIE_NAME]
}

export async function authenticate(request, response, next) {
  const token = getRequestToken(request)
  if (!token) return rejectAuthentication(request, response, 401, 'Authentication required.')

  let payload
  try {
    payload = verifyAuthToken(token)
  } catch {
    return rejectAuthentication(request, response, 401, 'Invalid or expired authentication token.')
  }

  if (typeof payload.sub !== 'string' || !mongoose.isValidObjectId(payload.sub)) {
    return rejectAuthentication(request, response, 401, 'Invalid or expired authentication token.')
  }

  const user = await getUserById(payload.sub)
  if (!user) return rejectAuthentication(request, response, 401, 'Invalid or expired authentication token.')

  request.user = user
  return next()
}

export async function optionalAuthenticate(request, _response, next) {
  const token = getRequestToken(request)
  if (token) {
    try {
      const payload = verifyAuthToken(token)
      if (typeof payload.sub === 'string' && mongoose.isValidObjectId(payload.sub)) {
        request.user = await getUserById(payload.sub) || undefined
      }
    } catch {
      // Public recipients do not need an account; invalid or expired cookies stay anonymous.
    }
  }
  return next()
}

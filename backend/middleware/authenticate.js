import mongoose from 'mongoose'
import { getUserById } from '../services/authService.js'
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/authToken.js'

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
  if (!token) return response.status(401).json({ message: 'Authentication required.' })

  let payload
  try {
    payload = verifyAuthToken(token)
  } catch {
    return response.status(401).json({ message: 'Invalid or expired authentication token.' })
  }

  if (typeof payload.sub !== 'string' || !mongoose.isValidObjectId(payload.sub)) {
    return response.status(401).json({ message: 'Invalid or expired authentication token.' })
  }

  const user = await getUserById(payload.sub)
  if (!user) return response.status(401).json({ message: 'Invalid or expired authentication token.' })

  request.user = user
  return next()
}

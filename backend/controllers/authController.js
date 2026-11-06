import { authenticateUser, registerUser } from '../services/authService.js'
import { AUTH_COOKIE_NAME, authCookieOptions, createAuthToken } from '../utils/authToken.js'
import { httpError } from '../utils/httpError.js'

function issueSession(response, user) {
  response.cookie(AUTH_COOKIE_NAME, createAuthToken(user.id), authCookieOptions())
}

export async function register(request, response) {
  const user = await registerUser(request.body || {})
  issueSession(response, user)
  response.status(201).json({ user })
}

export async function login(request, response) {
  const user = await authenticateUser(request.body || {})
  issueSession(response, user)
  response.json({ user })
}

export function logout(_request, response) {
  const { maxAge: _maxAge, ...cookieOptions } = authCookieOptions()
  response.clearCookie(AUTH_COOKIE_NAME, cookieOptions)
  response.json({ message: 'Logged out.' })
}

export function getCurrentUser(request, response) {
  if (!request.user) throw httpError(401, 'Authentication required.')
  response.json({ user: request.user })
}

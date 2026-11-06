import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const AUTH_COOKIE_NAME = 'sharesafe_token'

const tokenOptions = {
  expiresIn: '1h',
  issuer: 'sharesafe-api',
  audience: 'sharesafe-frontend',
}

export function createAuthToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtSecret, tokenOptions)
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret, {
    issuer: tokenOptions.issuer,
    audience: tokenOptions.audience,
  })
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || env.frontendUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/api',
    maxAge: 60 * 60 * 1000,
  }
}

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

export function createShareTokenSeed() {
  return randomBytes(32).toString('hex')
}

export function deriveShareToken(seed) {
  return createHmac('sha256', env.shareTokenSecret).update(seed).digest('base64url')
}

export function hashShareToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

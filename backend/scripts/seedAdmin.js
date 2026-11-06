import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'
import { env } from '../config/env.js'
import User from '../models/User.js'

const ADMIN_EMAIL = 'admin@sharesafe.local'
const ADMIN_NAME = 'ShareSafe Admin'
const BCRYPT_ROUNDS = 12

function assertLocalDevelopmentDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Admin seeding is disabled when NODE_ENV is production.')
  }

  const parsed = new URL(env.mongoUri)
  const hosts = parsed.hostname.split(',').map((host) => host.trim().toLowerCase())
  const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
  if (parsed.protocol !== 'mongodb:' || hosts.some((host) => !localHosts.has(host))) {
    throw new Error('Admin seeding only supports a local MongoDB database.')
  }
}

function getConfiguredPassword() {
  const password = process.env.ADMIN_PASSWORD
  if (password === undefined || password.length === 0) return null
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be 12–72 bytes when configured.')
  }
  return password
}

async function seedAdmin() {
  assertLocalDevelopmentDatabase()
  const configuredPassword = getConfiguredPassword()
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 })

  const existing = await User.findOne({ email: ADMIN_EMAIL }).select('+passwordHash')
  const generatedPassword = existing || configuredPassword ? null : randomBytes(32).toString('base64url')
  const password = configuredPassword || generatedPassword
  const update = { name: ADMIN_NAME, email: ADMIN_EMAIL, role: 'admin' }
  if (password) update.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    { $set: update },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )

  if (generatedPassword) {
    console.info(`Demo admin email: ${ADMIN_EMAIL}`)
    console.info(`Generated password (save this now): ${generatedPassword}`)
  } else {
    console.info(`Demo admin account is ready: ${ADMIN_EMAIL}`)
    if (!existing && configuredPassword) console.info('The configured ADMIN_PASSWORD was applied.')
    else if (existing && !configuredPassword) console.info('Existing password preserved; no password was printed.')
  }
}

try {
  await seedAdmin()
} catch (error) {
  console.error(`Admin seed failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect().catch(() => {})
}

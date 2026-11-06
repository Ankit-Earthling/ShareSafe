import bcrypt from 'bcrypt'
import User from '../models/User.js'
import { httpError } from '../utils/httpError.js'

const BCRYPT_ROUNDS = 12
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email) {
  if (typeof email !== 'string') throw httpError(400, 'Enter a valid email address.')
  const normalizedEmail = email.trim().toLowerCase()
  if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw httpError(400, 'Enter a valid email address.')
  }
  return normalizedEmail
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw httpError(400, 'Password must be at least 12 characters and no more than 72 bytes.')
  }
  return password
}

function safeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  }
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = validateEmail(email)
  const validPassword = validatePassword(password)
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    throw httpError(400, 'Name must be between 1 and 100 characters.')
  }

  if (await User.exists({ email: normalizedEmail })) {
    throw httpError(409, 'An account with this email already exists.')
  }

  const passwordHash = await bcrypt.hash(validPassword, BCRYPT_ROUNDS)
  try {
    const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash })
    return safeUser(user)
  } catch (error) {
    if (error.code === 11000) throw httpError(409, 'An account with this email already exists.')
    throw error
  }
}

export async function authenticateUser({ email, password }) {
  const normalizedEmail = validateEmail(email)
  const validPassword = validatePassword(password)
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash')
  if (!user || !(await bcrypt.compare(validPassword, user.passwordHash))) {
    throw httpError(401, 'Invalid email or password.')
  }
  return safeUser(user)
}

export async function getUserById(id) {
  const user = await User.findById(id)
  return user ? safeUser(user) : null
}

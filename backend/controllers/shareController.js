import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'
import ShareLink from '../models/ShareLink.js'
import StoredFile from '../models/StoredFile.js'
import { streamShareFile } from './fileController.js'
import { httpError } from '../utils/httpError.js'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MIN_PASSWORD_LENGTH = 8
const MAX_EXPIRY_DAYS = 30

function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex')
}

function shareStatus(share, now = new Date()) {
  if (share.revokedAt) return 'Revoked'
  if (share.expiresAt <= now) return 'Expired'
  if (share.accessCount >= share.maxAccesses) return 'Limit reached'
  return 'Active'
}

function presentShare(share, file = share.file) {
  return {
    id: share._id.toString(),
    fileId: file?._id?.toString() || share.file?.toString(),
    name: file?.originalName || 'Deleted file',
    expiresAt: share.expiresAt,
    maxAccesses: share.maxAccesses,
    accessCount: share.accessCount,
    status: shareStatus(share),
    passwordProtected: Boolean(share.passwordHash || share.hasPassword),
  }
}

function validToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw httpError(404, 'This sharing link is unavailable.')
  return tokenDigest(token)
}

export async function createShare(request, response) {
  const { fileId, expiryDays = 7, maxAccesses = 10, password } = request.body || {}
  if (typeof fileId !== 'string' || !mongoose.isValidObjectId(fileId)) throw httpError(400, 'Choose a valid file.')
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > MAX_EXPIRY_DAYS) {
    throw httpError(400, `Expiry must be between 1 and ${MAX_EXPIRY_DAYS} days.`)
  }
  if (!Number.isInteger(maxAccesses) || maxAccesses < 1 || maxAccesses > 1000) {
    throw httpError(400, 'The access limit must be between 1 and 1000.')
  }
  if (password !== undefined && password !== '' && (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > 72)) {
    throw httpError(400, `Link passwords must be at least ${MIN_PASSWORD_LENGTH} characters and no more than 72 bytes.`)
  }

  const file = await StoredFile.findOne({ _id: fileId, owner: request.user.id })
  if (!file) throw httpError(404, 'File not found.')
  const token = randomBytes(32).toString('base64url')
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined
  const share = await ShareLink.create({
    owner: request.user.id,
    file: file._id,
    tokenHash: tokenDigest(token),
    passwordHash,
    expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
    maxAccesses,
  })
  const publicUrl = new URL(`/share/${token}`, request.get('origin')).toString()
  response.status(201).json({ share: presentShare(share, file), url: publicUrl })
}

export async function listShares(request, response) {
  const shares = await ShareLink.find({ owner: request.user.id })
    .select('+passwordHash')
    .populate({ path: 'file', select: 'originalName' })
    .sort({ createdAt: -1 })
  response.json({ shares: shares.map((share) => presentShare(share)) })
}

export async function revokeShare(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw httpError(404, 'Sharing link not found.')
  const share = await ShareLink.findOneAndUpdate(
    { _id: request.params.id, owner: request.user.id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  ).select('+passwordHash')
  if (!share) throw httpError(404, 'Sharing link not found.')
  response.json({ share: presentShare(share) })
}

async function getAvailableShare(token) {
  const tokenHash = validToken(token)
  const share = await ShareLink.findOne({ tokenHash }).select('+passwordHash')
  if (!share || share.revokedAt || share.expiresAt <= new Date()) throw httpError(404, 'This sharing link is unavailable or expired.')
  if (share.accessCount >= share.maxAccesses) throw httpError(410, 'This sharing link has reached its access limit.')
  return { share, tokenHash }
}

export async function getPublicShare(request, response) {
  const { share } = await getAvailableShare(request.params.token)
  const file = await StoredFile.findById(share.file).select('originalName size mimeType')
  if (!file) throw httpError(404, 'This shared file is unavailable.')
  response.set('Cache-Control', 'no-store').json({
    name: file.originalName,
    size: file.size,
    expiresAt: share.expiresAt,
    passwordRequired: Boolean(share.passwordHash),
  })
}

export async function accessPublicShare(request, response) {
  const { share, tokenHash } = await getAvailableShare(request.params.token)
  if (share.passwordHash) {
    const password = request.body?.password
    if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72 || !(await bcrypt.compare(password, share.passwordHash))) {
      throw httpError(401, 'The link password is incorrect.')
    }
  }

  // The conditional atomic update is the gate for every access, including concurrent requests.
  const consumed = await ShareLink.findOneAndUpdate({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    $expr: { $lt: ['$accessCount', '$maxAccesses'] },
  }, { $inc: { accessCount: 1 } }, { new: true })
  if (!consumed) throw httpError(410, 'This sharing link is no longer available.')

  const file = await StoredFile.findOne({ _id: consumed.file, owner: consumed.owner }).select('+storageKey')
  if (!file) throw httpError(404, 'This shared file is unavailable.')
  return streamShareFile(file, response)
}

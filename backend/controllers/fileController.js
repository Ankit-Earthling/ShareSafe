import mongoose from 'mongoose'
import ShareLink from '../models/ShareLink.js'
import StoredFile from '../models/StoredFile.js'
import User from '../models/User.js'
import { MAX_FILE_SIZE, removeStagedFile, safeDownloadName, stagedStoragePath, validateStoredFile } from '../services/fileStorage.js'
import { openStoredFile, persistUploadedFile, removeStoredFile } from '../services/storage/index.js'
import { env } from '../config/env.js'
import { httpError } from '../utils/httpError.js'

function presentFile(file) {
  return {
    id: file._id.toString(),
    name: file.originalName,
    type: file.mimeType,
    size: file.size,
    scanStatus: file.scanStatus || 'clean',
    uploadedAt: file.createdAt,
  }
}

function presentStorage(user) {
  return { usedBytes: user.usedStorageBytes || 0, quotaBytes: user.storageQuotaBytes || env.defaultStorageQuotaBytes }
}

async function initializeStorageAccounting(userId) {
  // Backfill older accounts once before displaying or reserving quota.
  await User.updateOne({ _id: userId, storageQuotaBytes: { $exists: false } }, { $set: { storageQuotaBytes: env.defaultStorageQuotaBytes } })
  const legacy = await User.findOne({ _id: userId, usedStorageBytes: { $exists: false } }).select('_id')
  if (legacy) {
    const total = await StoredFile.aggregate([
      { $match: { owner: legacy._id, storageAccounted: { $ne: false } } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ])
    await User.updateOne({ _id: userId, usedStorageBytes: { $exists: false } }, { $set: { usedStorageBytes: total[0]?.total || 0 } })
  }
}

async function reserveStorage(userId, size) {
  await initializeStorageAccounting(userId)
  return User.findOneAndUpdate({
    _id: userId,
    $expr: { $lte: [{ $add: ['$usedStorageBytes', size] }, '$storageQuotaBytes'] },
  }, { $inc: { usedStorageBytes: size } }, { new: true })
}

async function markBlockedScan(file, userId, scanStatus) {
  await removeStagedFile(file.storageKey)
  const released = await StoredFile.findOneAndUpdate(
    { _id: file._id, storageAccounted: true },
    { $set: { scanStatus, storageAccounted: false } },
    { new: false },
  )
  if (released) await User.updateOne({ _id: userId }, { $inc: { usedStorageBytes: -released.size } })
  else await StoredFile.updateOne({ _id: file._id }, { $set: { scanStatus } })
}

export async function uploadFile(request, response) {
  if (!request.file) throw httpError(400, 'Choose a file to upload.')
  let file
  let reserved = false
  let preserveFailureRecord = false
  const storageProvider = env.storageDriver
  try {
    if (request.file.size < 1) throw httpError(400, 'The selected file is empty.')
    await validateStoredFile(request.file)
    const user = await reserveStorage(request.user.id, request.file.size)
    if (!user) throw httpError(413, 'This upload exceeds your available storage quota.')
    reserved = true
    file = await StoredFile.create({
      owner: request.user.id,
      storageKey: request.file.filename,
      storageProvider,
      originalName: safeDownloadName(request.file.originalname),
      mimeType: request.file.mimetype,
      size: request.file.size,
      scanStatus: 'pending',
    })
    const scanner = request.app.locals.scanFile
    let result
    try {
      result = await scanner(file.storageKey)
    } catch {
      await markBlockedScan(file, request.user.id, 'failed')
      reserved = false
      preserveFailureRecord = true
      throw httpError(503, 'Malware scanning is unavailable or did not complete. This file is blocked.', { expose: true })
    }
    if (result === 'infected' || result === 'suspicious') {
      const scanStatus = result === 'suspicious' ? 'suspicious' : 'infected'
      await markBlockedScan(file, request.user.id, scanStatus)
      reserved = false
      preserveFailureRecord = true
      throw httpError(422, result === 'suspicious'
        ? 'The scan marked this file suspicious. It has been removed and cannot be shared.'
        : 'The uploaded file was identified as malware and has been removed.')
    }
    if (result !== 'clean') {
      await markBlockedScan(file, request.user.id, 'failed')
      reserved = false
      preserveFailureRecord = true
      throw httpError(503, 'Malware scanning failed. This file cannot be shared until it scans clean.', { expose: true })
    }

    // Scan the staged bytes first; only an exact clean verdict is persisted.
    const storageKey = file.storageKey
    await persistUploadedFile(storageKey, stagedStoragePath(storageKey), request.file.mimetype, storageProvider)
    file = await StoredFile.findByIdAndUpdate(file._id, { $set: { scanStatus: 'clean' } }, { new: true })
    if (!file) {
      throw httpError(409, 'This upload was removed before its scan completed.')
    }
    await removeStagedFile(storageKey)
    const updatedUser = await User.findById(request.user.id).select('usedStorageBytes storageQuotaBytes')
    return response.status(201).json({ file: presentFile(file), storage: presentStorage(updatedUser), maxFileSize: MAX_FILE_SIZE })
  } catch (error) {
    if (!preserveFailureRecord) {
      await removeStoredFile(request.file.filename, storageProvider).catch(() => {})
      await removeStagedFile(request.file.filename).catch(() => {})
      if (file) await StoredFile.deleteOne({ _id: file._id })
      if (reserved) await User.updateOne({ _id: request.user.id }, { $inc: { usedStorageBytes: -request.file.size } })
    }
    throw error
  }
}

export async function listFiles(request, response) {
  await initializeStorageAccounting(request.user.id)
  const files = await StoredFile.find({ owner: request.user.id }).sort({ createdAt: -1 })
  const user = await User.findById(request.user.id).select('usedStorageBytes storageQuotaBytes')
  response.json({ files: files.map(presentFile), storage: presentStorage(user || {}) })
}

export async function getFile(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw httpError(404, 'File not found.')
  const file = await StoredFile.findOne({ _id: request.params.id, owner: request.user.id })
  if (!file) throw httpError(404, 'File not found.')
  response.json({ file: presentFile(file) })
}

export async function downloadOwnFile(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw httpError(404, 'File not found.')
  const file = await StoredFile.findOne({ _id: request.params.id, owner: request.user.id }).select('+storageKey +storageProvider')
  if (!file) throw httpError(404, 'File not found.')
  if (file.scanStatus !== 'clean') throw httpError(409, 'This file is unavailable until malware scanning succeeds.')
  return streamShareFile(file, response)
}

export async function deleteFile(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw httpError(404, 'File not found.')
  const current = await StoredFile.findOne({ _id: request.params.id, owner: request.user.id })
  if (!current) throw httpError(404, 'File not found.')
  if (current.scanStatus === 'pending') throw httpError(409, 'Wait for malware scanning to finish before deleting this file.')
  const file = await StoredFile.findOneAndDelete({ _id: request.params.id, owner: request.user.id }).select('+storageKey +storageProvider')
  if (!file) throw httpError(404, 'File not found.')

  const storageProvider = file.storageProvider || 'local'
  try {
    if (file.storageAccounted) await removeStoredFile(file.storageKey, storageProvider)
  } catch (error) {
    await StoredFile.create(file.toObject())
    throw error
  }
  await ShareLink.deleteMany({ file: file._id, owner: request.user.id })
  if (file.storageAccounted) await User.updateOne({ _id: request.user.id }, { $inc: { usedStorageBytes: -file.size } })
  const user = await User.findById(request.user.id).select('usedStorageBytes storageQuotaBytes')
  response.json({ message: 'File deleted.', storage: presentStorage(user || {}) })
}

export async function streamShareFile(file, response) {
  const stream = await openStoredFile(file.storageKey, file.storageProvider || 'local')
  response.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(file.size),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(file.originalName))}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  stream.on('error', () => {
    if (!response.headersSent) response.status(404).json({ message: 'Shared file is unavailable.' })
    else response.destroy()
  })
  stream.pipe(response)
}

export async function streamPreviewFile(file, response, watermark) {
  const stream = await openStoredFile(file.storageKey, file.storageProvider || 'local')
  response.set({
    'Content-Type': 'application/pdf',
    'Content-Length': String(file.size),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeDownloadName(file.originalName))}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-ShareSafe-Link-Id': watermark.linkId,
    'X-ShareSafe-Accessed-At': watermark.accessedAt,
    'X-ShareSafe-Viewer': watermark.viewer,
  })
  stream.on('error', () => {
    if (!response.headersSent) response.status(404).json({ message: 'Shared file is unavailable.' })
    else response.destroy()
  })
  stream.pipe(response)
}

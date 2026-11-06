import mongoose from 'mongoose'
import ShareLink from '../models/ShareLink.js'
import StoredFile from '../models/StoredFile.js'
import { MAX_FILE_SIZE, openStoredFile, removeStoredFile, safeDownloadName, validateStoredFile } from '../services/fileStorage.js'
import { httpError } from '../utils/httpError.js'

function presentFile(file) {
  return {
    id: file._id.toString(),
    name: file.originalName,
    type: file.mimeType,
    size: file.size,
    uploadedAt: file.createdAt,
  }
}

export async function uploadFile(request, response) {
  if (!request.file) throw httpError(400, 'Choose a file to upload.')
  try {
    if (request.file.size < 1) throw httpError(400, 'The selected file is empty.')
    await validateStoredFile(request.file)
    const file = await StoredFile.create({
      owner: request.user.id,
      storageKey: request.file.filename,
      originalName: safeDownloadName(request.file.originalname),
      mimeType: request.file.mimetype,
      size: request.file.size,
    })
    return response.status(201).json({ file: presentFile(file), maxFileSize: MAX_FILE_SIZE })
  } catch (error) {
    await removeStoredFile(request.file.filename).catch(() => {})
    throw error
  }
}

export async function listFiles(request, response) {
  const files = await StoredFile.find({ owner: request.user.id }).sort({ createdAt: -1 })
  response.json({ files: files.map(presentFile) })
}

export async function getFile(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw httpError(404, 'File not found.')
  const file = await StoredFile.findOne({ _id: request.params.id, owner: request.user.id })
  if (!file) throw httpError(404, 'File not found.')
  response.json({ file: presentFile(file) })
}

export async function deleteFile(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw httpError(404, 'File not found.')
  const file = await StoredFile.findOne({ _id: request.params.id, owner: request.user.id }).select('+storageKey')
  if (!file) throw httpError(404, 'File not found.')

  await removeStoredFile(file.storageKey)
  await Promise.all([
    ShareLink.deleteMany({ file: file._id, owner: request.user.id }),
    StoredFile.deleteOne({ _id: file._id, owner: request.user.id }),
  ])
  response.json({ message: 'File deleted.' })
}

export async function streamShareFile(file, response) {
  response.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(file.size),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(file.originalName))}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  const stream = openStoredFile(file.storageKey)
  stream.on('error', () => {
    if (!response.headersSent) response.status(404).json({ message: 'Shared file is unavailable.' })
    else response.destroy()
  })
  stream.pipe(response)
}

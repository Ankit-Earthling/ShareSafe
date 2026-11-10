import { mkdir, open, unlink } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import multer from 'multer'
import { httpError } from '../utils/httpError.js'

const uploadDirectory = path.resolve(fileURLToPath(new URL('../uploads/', import.meta.url)))
const stagingDirectory = path.resolve(uploadDirectory, '.staging')
export const MAX_FILE_SIZE = 10 * 1024 * 1024

const allowedTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.txt', 'text/plain'],
  ['.csv', 'text/csv'],
])

await Promise.all([
  mkdir(uploadDirectory, { recursive: true }),
  mkdir(stagingDirectory, { recursive: true }),
])

export const uploadSingleFile = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, stagingDirectory),
    filename: (_request, _file, callback) => callback(null, randomBytes(32).toString('hex')),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0, parts: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    if (allowedTypes.get(extension) !== file.mimetype) {
      return callback(httpError(415, 'This file type is not supported.'))
    }
    return callback(null, true)
  },
}).single('file')

export function storagePath(storageKey) {
  if (!/^[a-f0-9]{64}$/.test(storageKey)) throw httpError(404, 'File not found.')
  const resolvedPath = path.resolve(uploadDirectory, storageKey)
  if (!resolvedPath.startsWith(`${uploadDirectory}${path.sep}`)) throw httpError(404, 'File not found.')
  return resolvedPath
}

export function stagedStoragePath(storageKey) {
  if (!/^[a-f0-9]{64}$/.test(storageKey)) throw httpError(404, 'File not found.')
  const resolvedPath = path.resolve(stagingDirectory, storageKey)
  if (!resolvedPath.startsWith(`${stagingDirectory}${path.sep}`)) throw httpError(404, 'File not found.')
  return resolvedPath
}

export async function removeStagedFile(storageKey) {
  try {
    await unlink(stagedStoragePath(storageKey))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export async function validateStoredFile(file) {
  const filePath = stagedStoragePath(file.filename)
  const handle = await open(filePath, 'r')
  const header = Buffer.alloc(12)
  try {
    await handle.read(header, 0, header.length, 0)
  } finally {
    await handle.close()
  }
  const valid = file.mimetype === 'application/pdf'
    ? header.subarray(0, 5).toString() === '%PDF-'
    : file.mimetype === 'image/png'
      ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === 'image/jpeg'
        ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
        : file.mimetype === 'image/gif'
          ? ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString())
          : file.mimetype === 'image/webp'
            ? header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP'
            : await validateTextFile(filePath)
  if (!valid) throw httpError(415, 'The file contents do not match the selected file type.')
}

async function validateTextFile(filePath) {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    for await (const chunk of createReadStream(filePath)) {
      if (chunk.includes(0)) return false
      decoder.decode(chunk, { stream: true })
    }
    decoder.decode()
    return true
  } catch {
    return false
  }
}

export function safeDownloadName(name) {
  return path.basename(name).replace(/[\r\n"\\]/g, '_').slice(0, 255) || 'shared-file'
}

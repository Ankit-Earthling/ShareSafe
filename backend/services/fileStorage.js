import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import multer from 'multer'
import { httpError } from '../utils/httpError.js'

const uploadDirectory = path.resolve(fileURLToPath(new URL('../uploads/', import.meta.url)))
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

await mkdir(uploadDirectory, { recursive: true })

export const uploadSingleFile = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, uploadDirectory),
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

export async function removeStagedFile(storageKey) {
  try {
    await unlink(storagePath(storageKey))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export async function validateStoredFile(file) {
  const { readFile } = await import('node:fs/promises')
  const data = await readFile(storagePath(file.filename))
  const valid = file.mimetype === 'application/pdf'
    ? data.subarray(0, 5).toString() === '%PDF-'
    : file.mimetype === 'image/png'
      ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === 'image/jpeg'
        ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
        : file.mimetype === 'image/gif'
          ? ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString())
          : file.mimetype === 'image/webp'
            ? data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
            : validateText(data)
  if (!valid) throw httpError(415, 'The file contents do not match the selected file type.')
}

function validateText(data) {
  if (data.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data)
    return true
  } catch {
    return false
  }
}

export function safeDownloadName(name) {
  return path.basename(name).replace(/[\r\n"\\]/g, '_').slice(0, 255) || 'shared-file'
}

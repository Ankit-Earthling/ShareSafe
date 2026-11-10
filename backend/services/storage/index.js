import { env } from '../../config/env.js'
import { localStorage } from './localStorage.js'

async function adapterFor(provider = env.storageDriver) {
  if (provider === 'local') return localStorage
  if (provider === 'b2') {
    const { backblazeB2Storage } = await import('./backblazeB2Client.js')
    if (backblazeB2Storage) return backblazeB2Storage
  }
  throw new Error('The configured file storage provider is unavailable.')
}

export async function persistUploadedFile(storageKey, sourcePath, contentType, provider = env.storageDriver) {
  return (await adapterFor(provider)).putFile(storageKey, sourcePath, contentType)
}

export async function openStoredFile(storageKey, provider = 'local') {
  return (await adapterFor(provider)).getFile(storageKey)
}

export async function removeStoredFile(storageKey, provider = 'local') {
  return (await adapterFor(provider)).removeFile(storageKey)
}

export async function inspectStoredFile(storageKey, provider = 'local') {
  return (await adapterFor(provider)).headFile(storageKey)
}

export { localStorage }

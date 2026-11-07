import { env } from '../../config/env.js'
import { backblazeB2Storage } from './backblazeB2Client.js'
import { localStorage } from './localStorage.js'

const storageAdapters = { local: localStorage, b2: backblazeB2Storage }

function adapterFor(provider = env.storageDriver) {
  const adapter = storageAdapters[provider]
  if (!adapter) throw new Error('The configured file storage provider is unavailable.')
  return adapter
}

export async function persistUploadedFile(storageKey, sourcePath, contentType, provider = env.storageDriver) {
  return adapterFor(provider).putFile(storageKey, sourcePath, contentType)
}

export async function openStoredFile(storageKey, provider = 'local') {
  return adapterFor(provider).getFile(storageKey)
}

export async function removeStoredFile(storageKey, provider = 'local') {
  return adapterFor(provider).removeFile(storageKey)
}

export async function inspectStoredFile(storageKey, provider = 'local') {
  return adapterFor(provider).headFile(storageKey)
}

export { backblazeB2Storage, localStorage }

import { createReadStream } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { storagePath, stagedStoragePath } from '../fileStorage.js'

export const localStorage = {
  async putFile(storageKey, sourcePath) {
    const destination = storagePath(storageKey)
    if (sourcePath !== destination) await rename(sourcePath, destination)
    const fileStat = await stat(destination)
    return { size: fileStat.size }
  },

  async getFile(storageKey) {
    return createReadStream(storagePath(storageKey))
  },

  async removeFile(storageKey) {
    try {
      await unlink(storagePath(storageKey))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  },

  async headFile(storageKey) {
    const fileStat = await stat(storagePath(storageKey))
    return { size: fileStat.size }
  },

  async check() {
    await access(dirname(storagePath('0'.repeat(64))), constants.R_OK | constants.W_OK)
    await access(dirname(stagedStoragePath('0'.repeat(64))), constants.R_OK | constants.W_OK)
  },
}

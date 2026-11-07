import { createReadStream } from 'node:fs'
import { copyFile, stat, unlink } from 'node:fs/promises'
import { storagePath } from '../fileStorage.js'

export const localStorage = {
  async putFile(storageKey, sourcePath) {
    const destination = storagePath(storageKey)
    if (sourcePath !== destination) await copyFile(sourcePath, destination)
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
}

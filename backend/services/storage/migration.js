export async function migrateLocalObjectToB2({
  storageKey,
  sourcePath,
  contentType,
  expectedSize,
  b2Storage,
  activateProvider,
}) {
  const uploaded = await b2Storage.putFile(storageKey, sourcePath, contentType)
  const remote = await b2Storage.headFile(storageKey)
  if (uploaded.size !== expectedSize || remote.size !== expectedSize || !uploaded.sha256 || remote.sha256 !== uploaded.sha256) {
    throw new Error('Backblaze B2 object verification failed.')
  }

  const activated = await activateProvider()
  if (!activated) {
    // The local record may have been deleted while the copy ran; remove its orphaned B2 copy.
    await b2Storage.removeFile(storageKey)
    return false
  }
  return true
}

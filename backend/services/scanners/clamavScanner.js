import net from 'node:net'
import { createReadStream } from 'node:fs'
import { stagedStoragePath } from '../fileStorage.js'

const CHUNK_SIZE = 64 * 1024
const MAX_REPLY_BYTES = 16 * 1024

function createClientError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function connectToClamAv({ host, port, timeoutMs, createConnection }) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(createClientError('ClamAV connection timed out.', 'CLAMAV_CONNECT_TIMEOUT'))
    }, timeoutMs)

    const onConnect = () => {
      clearTimeout(timer)
      socket.setNoDelay(true)
      resolve(socket)
    }
    const onError = () => {
      clearTimeout(timer)
      reject(createClientError('ClamAV daemon is unavailable.', 'CLAMAV_UNAVAILABLE'))
    }
    socket.once('connect', onConnect)
    socket.once('error', onError)
  })
}

function readReply(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let receivedBytes = 0
    const timer = setTimeout(() => {
      socket.destroy()
      reject(createClientError('ClamAV scan timed out.', 'CLAMAV_SCAN_TIMEOUT'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('end', onEnd)
      socket.off('close', onClose)
    }
    const onData = (chunk) => {
      receivedBytes += chunk.length
      if (receivedBytes > MAX_REPLY_BYTES) {
        cleanup()
        socket.destroy()
        reject(createClientError('ClamAV returned an invalid response.', 'CLAMAV_INVALID_RESPONSE'))
        return
      }
      chunks.push(chunk)
      const reply = Buffer.concat(chunks)
      const terminator = reply.indexOf(0)
      if (terminator !== -1) {
        cleanup()
        resolve(reply.subarray(0, terminator).toString('utf8'))
      }
    }
    const onError = () => {
      cleanup()
      reject(createClientError('ClamAV daemon connection failed.', 'CLAMAV_CONNECTION_ERROR'))
    }
    const onEnd = () => {
      cleanup()
      reject(createClientError('ClamAV closed the connection without a complete response.', 'CLAMAV_INVALID_RESPONSE'))
    }
    const onClose = () => {
      cleanup()
      reject(createClientError('ClamAV closed the connection without a complete response.', 'CLAMAV_INVALID_RESPONSE'))
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
    socket.once('close', onClose)
  })
}

function write(socket, chunk) {
  return new Promise((resolve, reject) => {
    socket.write(chunk, (error) => error ? reject(error) : resolve())
  })
}

async function daemonCommand({ host, port, connectTimeoutMs, timeoutMs, createConnection }, command, sendFile) {
  const socket = await connectToClamAv({ host, port, timeoutMs: connectTimeoutMs, createConnection })
  const replyPromise = readReply(socket, timeoutMs)
  try {
    await write(socket, Buffer.from(`z${command}\0`))
    if (sendFile) {
      for await (const chunk of createReadStream(sendFile, { highWaterMark: CHUNK_SIZE })) {
        const length = Buffer.allocUnsafe(4)
        length.writeUInt32BE(chunk.length)
        await write(socket, length)
        await write(socket, chunk)
      }
      await write(socket, Buffer.alloc(4))
    }
    return await replyPromise
  } catch (error) {
    socket.destroy()
    await replyPromise.catch(() => {})
    if (error?.code === 'CLAMAV_SCAN_TIMEOUT' || error?.code === 'CLAMAV_CONNECT_TIMEOUT') throw error
    throw createClientError('ClamAV daemon request failed.', 'CLAMAV_CONNECTION_ERROR')
  } finally {
    socket.destroy()
  }
}

export function createClamAvScanner({
  host = '127.0.0.1',
  port = 3310,
  connectTimeoutMs = 5000,
  timeoutMs = 120000,
  createConnection = net.createConnection,
  filePathForKey = stagedStoragePath,
} = {}) {
  const options = { host, port, connectTimeoutMs, timeoutMs, createConnection }

  async function check() {
    const ping = await daemonCommand(options, 'PING')
    if (ping !== 'PONG') throw createClientError('ClamAV daemon did not respond to PING.', 'CLAMAV_UNAVAILABLE')
    const version = await daemonCommand(options, 'VERSION')
    if (!/^ClamAV\s+\S+\/\d+\//.test(version)) {
      throw createClientError('ClamAV virus definitions are not ready.', 'CLAMAV_DEFINITIONS_UNAVAILABLE')
    }
    return true
  }

  async function scan(storageKey) {
    const reply = await daemonCommand(options, 'INSTREAM', filePathForKey(storageKey))
    if (reply === 'stream: OK') return 'clean'
    if (/^stream: .+ FOUND$/.test(reply)) return 'infected'
    throw createClientError('ClamAV returned an error or unknown verdict.', 'CLAMAV_SCAN_FAILED')
  }

  scan.check = check
  return scan
}

export const scanWithClamAv = createClamAvScanner()

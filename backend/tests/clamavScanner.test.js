import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { createClamAvScanner } from '../services/scanners/clamavScanner.js'

const eicarFixture = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
const tempDirectories = []
const servers = []

async function createTempFile(contents) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sharesafe-clamav-test-'))
  tempDirectories.push(directory)
  const filePath = path.join(directory, 'scan-fixture.txt')
  await writeFile(filePath, contents)
  return filePath
}

async function startFakeClamD({ holdInstream = false, errorResponse } = {}) {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0)
    let command
    const contents = []

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!command) {
        const terminator = buffer.indexOf(0)
        if (terminator < 0) return
        command = buffer.subarray(0, terminator).toString('utf8')
        buffer = buffer.subarray(terminator + 1)
        if (command === 'zPING') {
          socket.end(Buffer.from('PONG\0'))
          return
        }
        if (command === 'zVERSION') {
          socket.end(Buffer.from('ClamAV 1.5.4/63/28176/Wed Nov  8 00:00:00 2026\0'))
          return
        }
        if (command !== 'zINSTREAM' || holdInstream) return
      }
      if (command !== 'zINSTREAM' || holdInstream) return

      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0)
        if (buffer.length < length + 4) return
        buffer = buffer.subarray(4)
        if (length === 0) {
          const fileBytes = Buffer.concat(contents)
          const response = errorResponse || (fileBytes.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))
            ? 'stream: Eicar-Test-Signature FOUND\0'
            : 'stream: OK\0')
          socket.end(Buffer.from(response))
          return
        }
        contents.push(buffer.subarray(0, length))
        buffer = buffer.subarray(length)
      }
    })
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test('ClamAV INSTREAM accepts only an explicit clean response and rejects the EICAR fixture', async () => {
  const port = await startFakeClamD()
  const cleanFile = await createTempFile('ShareSafe clean test fixture.')
  const eicarFile = await createTempFile(eicarFixture)
  const scanner = createClamAvScanner({ host: '127.0.0.1', port, filePathForKey: (filePath) => filePath })

  assert.equal(await scanner.check(), true)
  assert.equal(await scanner(cleanFile), 'clean')
  assert.equal(await scanner(eicarFile), 'infected')
})

test('ClamAV connection failures and scan timeouts fail closed', async () => {
  const unused = createServer()
  unused.listen(0, '127.0.0.1')
  await once(unused, 'listening')
  const unavailablePort = unused.address().port
  await new Promise((resolve) => unused.close(resolve))
  const filePath = await createTempFile('test bytes')
  const unavailableScanner = createClamAvScanner({
    host: '127.0.0.1',
    port: unavailablePort,
    connectTimeoutMs: 100,
    filePathForKey: (value) => value,
  })
  await assert.rejects(unavailableScanner(filePath), { code: 'CLAMAV_UNAVAILABLE' })

  const port = await startFakeClamD({ holdInstream: true })
  const timeoutScanner = createClamAvScanner({
    host: '127.0.0.1',
    port,
    timeoutMs: 50,
    connectTimeoutMs: 500,
    filePathForKey: (value) => value,
  })
  await assert.rejects(timeoutScanner(filePath), { code: 'CLAMAV_SCAN_TIMEOUT' })
})

test('unknown daemon responses fail closed instead of becoming clean', async () => {
  const port = await startFakeClamD({ errorResponse: 'stream: ERROR\0' })
  const filePath = await createTempFile('test bytes')
  const scanner = createClamAvScanner({ host: '127.0.0.1', port, filePathForKey: (value) => value })
  await assert.rejects(scanner(filePath), { code: 'CLAMAV_SCAN_FAILED' })
})

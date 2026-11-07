import { spawn } from 'node:child_process'
import { env } from '../../config/env.js'
import { storagePath } from '../fileStorage.js'

export function createClamAvScanner({ command = env.clamavCommand, timeoutMs = 120000 } = {}) {
  return (storageKey) => new Promise((resolve, reject) => {
    let scanner
    try {
      scanner = spawn(command, ['--no-summary', '--infected', storagePath(storageKey)], { windowsHide: true })
    } catch {
      reject(new Error('ClamAV could not be started.'))
      return
    }
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(result)
    }
    const timer = setTimeout(() => {
      scanner.kill()
      finish(new Error('ClamAV scan timed out.'))
    }, timeoutMs)
    scanner.once('error', () => finish(new Error('ClamAV is unavailable.')))
    scanner.once('close', (code) => {
      if (code === 0) finish(null, 'clean')
      else if (code === 1) finish(null, 'infected')
      else finish(new Error('ClamAV scan failed.'))
    })
  })
}

export const scanWithClamAv = createClamAvScanner()

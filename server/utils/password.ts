import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'

// NOTE: scripts/create-user.mjs uses the same format and parameters.
const KEY_LENGTH = 64
const COST = 65536 // N
const BLOCK_SIZE = 8 // r
const PARALLELISM = 1 // p
const MAX_MEMORY = 256 * 1024 * 1024

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 128

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

// Stored format: scrypt$N$r$p$salt(base64)$hash(base64)
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  })
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false

    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    if (![N, r, p].every((v) => Number.isInteger(v) && v > 0)) return false

    const salt = Buffer.from(parts[4]!, 'base64')
    const expected = Buffer.from(parts[5]!, 'base64')

    const actual = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// Used when the username does not exist, so that "unknown user" and
// "wrong password" take about the same time (prevents user enumeration).
let dummyHash: Promise<string> | undefined
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  return dummyHash
}
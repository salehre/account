// scripts/create-user.mjs
// Usage:  node --env-file=.env scripts/create-user.mjs [role]
// Creates a user (default role: admin), or resets the password of an existing one.
import { randomBytes, scrypt } from 'node:crypto'
import readline from 'node:readline'
import pg from 'pg'

// Must match server/utils/password.ts
const KEY_LENGTH = 64
const COST = 65536
const BLOCK_SIZE = 8
const PARALLELISM = 1
const MAX_MEMORY = 256 * 1024 * 1024
const MIN_PASSWORD_LENGTH = 10

function hashPassword(password) {
  const salt = randomBytes(16)
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY },
      (error, key) => {
        if (error) return reject(error)
        resolve(
          ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$'),
        )
      },
    )
  })
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    let muted = false
    const originalWrite = rl._writeToOutput.bind(rl)
    rl._writeToOutput = (text) => {
      if (!muted) originalWrite(text)
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer)
    })
    muted = hidden // mute only what the user types, not the prompt itself
  })
}

async function main() {
  const roleName = process.argv[2] ?? 'admin'
  const connectionString = process.env.NUXT_DATABASE_URL
  if (!connectionString) {
    console.error('NUXT_DATABASE_URL is not set. Run with: node --env-file=.env scripts/create-user.mjs')
    process.exitCode = 1
    return
  }

  const client = new pg.Client({ connectionString })
  await client.connect()

  try {
    const role = await client.query('SELECT id FROM roles WHERE name = $1', [roleName])
    if (role.rows.length === 0) {
      console.error(`Role "${roleName}" does not exist (use admin, accountant or viewer).`)
      process.exitCode = 1
      return
    }

    const username = (await ask('Username: ')).trim().toLowerCase()
    const fullName = (await ask('Full name: ')).trim()
    const password = await ask(`Password (min ${MIN_PASSWORD_LENGTH} chars): `, true)
    const confirm = await ask('Repeat password: ', true)

    if (!username || !fullName) {
      console.error('Username and full name are required.')
      process.exitCode = 1
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      process.exitCode = 1
      return
    }
    if (password !== confirm) {
      console.error('Passwords do not match.')
      process.exitCode = 1
      return
    }

    const hash = await hashPassword(password)
    const existing = await client.query('SELECT id FROM users WHERE lower(username) = $1', [username])

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users
            SET password_hash = $2, is_active = true, failed_login_count = 0, locked_until = NULL
          WHERE id = $1`,
        [existing.rows[0].id, hash],
      )
      console.log(`User "${username}" already existed: password reset, account unlocked.`)
    } else {
      await client.query(
        `INSERT INTO users (username, full_name, password_hash, role_id)
         VALUES ($1, $2, $3, $4)`,
        [username, fullName, hash, role.rows[0].id],
      )
      console.log(`User "${username}" created with role "${roleName}".`)
    }
  } finally {
    await client.end()
  }
}

await main()
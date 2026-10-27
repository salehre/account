import { z } from 'zod'

const bodySchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
})

const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

interface LoginRow {
  id: number
  username: string
  fullName: string
  passwordHash: string
  isActive: boolean
  lockedUntil: Date | null
  role: string
  permissions: string[]
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, bodySchema)
  const username = body.username.toLowerCase()
  const ip = getRequestIP(event) ?? null

  const [user] = await query<LoginRow>(
    `SELECT u.id,
            u.username,
            u.full_name     AS "fullName",
            u.password_hash AS "passwordHash",
            u.is_active     AS "isActive",
            u.locked_until  AS "lockedUntil",
            r.name          AS role,
            r.permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE lower(u.username) = $1`,
    [username],
  )

  // Unknown or disabled user: same error and similar timing as a wrong password
  if (!user || !user.isActive) {
    await verifyPassword(body.password, await getDummyHash())
    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw createError({
      statusCode: 429,
      message: 'Too many failed attempts. Please try again later.',
    })
  }

  const valid = await verifyPassword(body.password, user.passwordHash)

  if (!valid) {
    await query(
      `UPDATE users SET
         failed_login_count = CASE WHEN failed_login_count + 1 >= $2
                                   THEN 0 ELSE failed_login_count + 1 END,
         locked_until = CASE WHEN failed_login_count + 1 >= $2
                             THEN now() + make_interval(mins => $3)
                             ELSE locked_until END
       WHERE id = $1`,
      [user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
    )
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
       VALUES ($1, 'login_failed', 'user', $1, $2)`,
      [user.id, JSON.stringify({ ip })],
    )
    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  // Success
  await query('DELETE FROM sessions WHERE expires_at < now()')
  await query(
    `UPDATE users
        SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
      WHERE id = $1`,
    [user.id],
  )
  await createSession(event, user.id)
  await query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
     VALUES ($1, 'login', 'user', $1, $2)`,
    [user.id, JSON.stringify({ ip })],
  )

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions,
  }
})
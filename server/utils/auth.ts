import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'

export const SESSION_COOKIE = 'acc_session'
const SESSION_HOURS = 12

export interface AuthUser {
  id: number
  username: string
  fullName: string
  role: string
  permissions: string[]
  sessionId: number
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function hasPermission(granted: string[], required: string): boolean {
  return granted.some(
    (p) =>
      p === '*' ||
      p === required ||
      (p.endsWith('.*') && required.startsWith(p.slice(0, -1))),
  )
}

// Creates a session row and sets the cookie.
export async function createSession(event: H3Event, userId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const { cookieSecure } = useRuntimeConfig()

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [
      userId,
      hashToken(token),
      SESSION_HOURS,
      getRequestIP(event) ?? null,
      (getRequestHeader(event, 'user-agent') ?? '').slice(0, 300),
    ],
  )

  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(cookieSecure) === 'true',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  })
}

// Returns the logged-in user for this request, or null.
export async function loadSessionUser(event: H3Event): Promise<AuthUser | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null

  const [row] = await query<AuthUser & { isActive: boolean }>(
    `SELECT s.id          AS "sessionId",
            u.id          AS "id",
            u.username    AS "username",
            u.full_name   AS "fullName",
            u.is_active   AS "isActive",
            r.name        AS "role",
            r.permissions AS "permissions"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()`,
    [hashToken(token)],
  )
  if (!row || !row.isActive) return null

  // Record activity at most once per minute
  await query(
    `UPDATE sessions SET last_seen_at = now()
      WHERE id = $1 AND last_seen_at < now() - interval '1 minute'`,
    [row.sessionId],
  )

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    permissions: row.permissions,
    sessionId: row.sessionId,
  }
}

// Used by API handlers; the middleware has already authenticated the request.
export function getCurrentUser(event: H3Event): AuthUser {
  const user = event.context.user as AuthUser | undefined
  if (!user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }
  return user
}
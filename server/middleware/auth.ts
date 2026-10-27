import type { H3Event } from 'h3'

// Anyone may call these without logging in.
const PUBLIC: Array<[method: string, path: string]> = [
  ['GET', '/api/health'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/logout'],
]

// Any logged-in user may call these (no specific permission needed).
const LOGGED_IN_ONLY: Array<[method: string, path: string]> = [
  ['GET', '/api/auth/me'],
  ['POST', '/api/auth/change-password'],
]

// Which permission each route needs.
// A route that is NOT listed here is admin-only (default deny).
const POLICIES: Array<{ method: string; pattern: RegExp; permission: string }> = [
  { method: 'GET',    pattern: /^\/api\/accounts$/,                permission: 'accounts.read' },
  { method: 'GET',    pattern: /^\/api\/entries$/,                 permission: 'entries.read' },
  { method: 'POST',   pattern: /^\/api\/entries$/,                 permission: 'entries.write' },
  { method: 'GET',    pattern: /^\/api\/entries\/\d+$/,            permission: 'entries.read' },
  { method: 'DELETE', pattern: /^\/api\/entries\/\d+$/,            permission: 'entries.write' },
  { method: 'POST',   pattern: /^\/api\/entries\/\d+\/post$/,      permission: 'entries.post' },
  { method: 'POST',   pattern: /^\/api\/entries\/\d+\/reverse$/,   permission: 'entries.reverse' },
]

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Extra CSRF protection on top of SameSite cookies: if the browser sends
// an Origin header, it must match our own host.
function assertSameOrigin(event: H3Event): void {
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw createError({ statusCode: 403, message: 'Invalid origin' })
  }
  if (originHost !== getRequestHost(event)) {
    throw createError({ statusCode: 403, message: 'Cross-origin request blocked' })
  }
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname.replace(/\/+$/, '')
  if (!path.startsWith('/api/')) return

  const method = event.method

  if (UNSAFE_METHODS.has(method)) assertSameOrigin(event)

  if (PUBLIC.some(([m, p]) => m === method && p === path)) return

  const user = await loadSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }
  event.context.user = user

  if (LOGGED_IN_ONLY.some(([m, p]) => m === method && p === path)) return

  const policy = POLICIES.find((p) => p.method === method && p.pattern.test(path))
  const required = policy?.permission ?? '*'

  if (!hasPermission(user.permissions, required)) {
    throw createError({ statusCode: 403, message: 'You do not have permission to do this' })
  }
})
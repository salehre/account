export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { ok: true }
})
export default defineEventHandler(async () => {
  await query('SELECT 1')
  return { ok: true }
})
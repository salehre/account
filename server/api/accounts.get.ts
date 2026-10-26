export default defineEventHandler(async () => {
  return await query(
    `SELECT id, parent_id, code, name, level, nature, is_postable
       FROM accounts
      ORDER BY code`,
  )
})
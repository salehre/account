import { z } from 'zod'

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH),
})

export default defineEventHandler(async (event) => {
  const user = getCurrentUser(event)
  const body = await parseBody(event, bodySchema)

  const [row] = await query<{ passwordHash: string }>(
    'SELECT password_hash AS "passwordHash" FROM users WHERE id = $1',
    [user.id],
  )
  if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
    throw createError({ statusCode: 400, message: 'Current password is incorrect' })
  }
  if (body.newPassword === body.currentPassword) {
    throw createError({ statusCode: 400, message: 'New password must be different from the current one' })
  }

  const newHash = await hashPassword(body.newPassword)

  await withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, newHash])
    // Log out every other device
    await client.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [user.id, user.sessionId])
    await writeAudit(client, {
      userId: user.id,
      action: 'change_password',
      entity: 'user',
      entityId: user.id,
    })
  })

  return { ok: true }
})
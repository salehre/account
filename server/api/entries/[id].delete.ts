export default defineEventHandler(async (event) => {
  const id = parseId(event)
  const userId = getCurrentUserId(event)

  try {
    await withTransaction(async (client) => {
      const result = await client.query(
        'DELETE FROM journal_entries WHERE id = $1 RETURNING id',
        [id],
      )
      if (result.rowCount === 0) {
        throw createError({ statusCode: 404, message: 'Entry not found' })
      }
      await writeAudit(client, {
        userId,
        action: 'delete',
        entity: 'journal_entry',
        entityId: id,
      })
    })
    return { ok: true }
  } catch (error) {
    rethrowDbError(error)
  }
})
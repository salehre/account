export default defineEventHandler(async (event) => {
  const id = parseId(event)
  const userId = getCurrentUserId(event)

  try {
    await withTransaction(async (client) => {
      const result = await client.query<{ number: number }>(
        `UPDATE journal_entries
            SET status = 'posted', posted_by = $2
          WHERE id = $1 AND status = 'draft'
          RETURNING number`,
        [id, userId],
      )

      if (result.rowCount === 0) {
        const existing = await client.query('SELECT 1 FROM journal_entries WHERE id = $1', [id])
        if (existing.rowCount === 0) {
          throw createError({ statusCode: 404, message: 'Entry not found' })
        }
        throw createError({ statusCode: 409, message: 'Entry is already posted' })
      }

      await writeAudit(client, {
        userId,
        action: 'post',
        entity: 'journal_entry',
        entityId: id,
        details: { number: result.rows[0]!.number },
      })
    })

    return await getEntryWithLines(id)
  } catch (error) {
    rethrowDbError(error)
  }
})
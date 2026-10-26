import { z } from 'zod'

const bodySchema = z.object({ date: dateSchema.optional() }).default({})

export default defineEventHandler(async (event) => {
  const id = parseId(event)
  const body = await parseBody(event, bodySchema)
  const userId = getCurrentUserId(event)

  try {
    const newId = await withTransaction(async (client) => {
      const result = await client.query<{ id: number }>(
        'SELECT reverse_entry($1, $2, $3) AS id',
        [id, userId, body.date ?? null],
      )
      const reversalId = result.rows[0]!.id

      await writeAudit(client, {
        userId,
        action: 'reverse',
        entity: 'journal_entry',
        entityId: id,
        details: { reversalEntryId: reversalId },
      })
      return reversalId
    })

    setResponseStatus(event, 201)
    return await getEntryWithLines(newId)
  } catch (error) {
    rethrowDbError(error)
  }
})
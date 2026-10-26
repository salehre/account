import { z } from 'zod'

const lineSchema = z
  .object({
    accountId: idSchema,
    detailId: idSchema.nullish(),
    description: z.string().trim().max(500).nullish(),
    debit: rialSchema.default(0),
    credit: rialSchema.default(0),
  })
  .refine((line) => (line.debit > 0) !== (line.credit > 0), {
    message: 'Each line must have either a debit or a credit amount (not both, not neither)',
  })

const bodySchema = z.object({
  fiscalYearId: idSchema,
  entryDate: dateSchema,
  description: z.string().trim().max(1000).nullish(),
  lines: z.array(lineSchema).min(2).max(500),
})

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, bodySchema)
  const userId = getCurrentUserId(event)

  try {
    const entryId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO journal_entries (fiscal_year_id, entry_date, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [body.fiscalYearId, body.entryDate, body.description ?? null, userId],
      )
      const id = inserted.rows[0]!.id

      for (const [index, line] of body.lines.entries()) {
        await client.query(
          `INSERT INTO journal_lines
             (entry_id, line_no, account_id, detail_id, description, debit, credit)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            index + 1,
            line.accountId,
            line.detailId ?? null,
            line.description ?? null,
            line.debit,
            line.credit,
          ],
        )
      }

      await writeAudit(client, {
        userId,
        action: 'create',
        entity: 'journal_entry',
        entityId: id,
        details: { lines: body.lines.length },
      })

      return id
    })

    setResponseStatus(event, 201)
    return await getEntryWithLines(entryId)
  } catch (error) {
    rethrowDbError(error)
  }
})
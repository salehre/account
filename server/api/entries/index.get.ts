import { z } from 'zod'

const querySchema = z.object({
  fiscalYearId: idSchema.optional(),
  status: z.enum(['draft', 'posted']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export default defineEventHandler(async (event) => {
  const q = parseQuery(event, querySchema)

  const conditions: string[] = []
  const params: unknown[] = []

  if (q.fiscalYearId) {
    const idx = params.push(q.fiscalYearId)
    conditions.push(`e.fiscal_year_id = $${idx}`)
  }
  if (q.status) {
    const idx = params.push(q.status)
    conditions.push(`e.status = $${idx}`)
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const [countRow] = await query<{ total: number }>(
    `SELECT count(*) AS total FROM journal_entries e ${whereSql}`,
    params,
  )

  const limitIdx = params.push(q.pageSize)
  const offsetIdx = params.push((q.page - 1) * q.pageSize)

  const items = await query(
    `SELECT e.id,
            e.number,
            e.entry_date   AS "entryDate",
            e.description,
            e.status,
            e.source_type  AS "sourceType",
            COALESCE(s.total_debit, 0) AS "totalDebit"
       FROM journal_entries e
       LEFT JOIN LATERAL (
              SELECT sum(debit) AS total_debit
                FROM journal_lines
               WHERE entry_id = e.id
            ) s ON true
       ${whereSql}
      ORDER BY e.entry_date DESC, e.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  )

  return {
    items,
    page: q.page,
    pageSize: q.pageSize,
    total: countRow?.total ?? 0,
  }
})
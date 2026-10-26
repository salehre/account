import type { PoolClient } from 'pg'

interface EntryHeader {
  id: number
  fiscalYearId: number
  number: number | null
  entryDate: string
  description: string | null
  status: 'draft' | 'posted'
  sourceType: string
  sourceId: number | null
  reversesEntryId: number | null
  createdBy: number
  createdAt: Date
  postedBy: number | null
  postedAt: Date | null
}

interface EntryLine {
  id: number
  lineNo: number
  accountId: number
  accountCode: string
  accountName: string
  detailId: number | null
  detailName: string | null
  description: string | null
  debit: number
  credit: number
}

export async function writeAudit(
  client: PoolClient,
  params: {
    userId: number
    action: string
    entity: string
    entityId: number
    details?: unknown
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.userId,
      params.action,
      params.entity,
      params.entityId,
      params.details === undefined ? null : JSON.stringify(params.details),
    ],
  )
}

export async function getEntryWithLines(id: number) {
  const [entry] = await query<EntryHeader>(
    `SELECT id,
            fiscal_year_id     AS "fiscalYearId",
            number,
            entry_date         AS "entryDate",
            description,
            status,
            source_type        AS "sourceType",
            source_id          AS "sourceId",
            reverses_entry_id  AS "reversesEntryId",
            created_by         AS "createdBy",
            created_at         AS "createdAt",
            posted_by          AS "postedBy",
            posted_at          AS "postedAt"
       FROM journal_entries
      WHERE id = $1`,
    [id],
  )
  if (!entry) {
    throw createError({ statusCode: 404, message: 'Entry not found' })
  }

  const lines = await query<EntryLine>(
    `SELECT l.id,
            l.line_no     AS "lineNo",
            l.account_id  AS "accountId",
            a.code        AS "accountCode",
            a.name        AS "accountName",
            l.detail_id   AS "detailId",
            d.name        AS "detailName",
            l.description,
            l.debit,
            l.credit
       FROM journal_lines l
       JOIN accounts a             ON a.id = l.account_id
       LEFT JOIN detail_accounts d ON d.id = l.detail_id
      WHERE l.entry_id = $1
      ORDER BY l.line_no`,
    [id],
  )

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

  return {
    ...entry,
    totalDebit,
    totalCredit,
    isBalanced: totalDebit === totalCredit,
    lines,
  }
}
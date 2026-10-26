export default defineEventHandler(async () => {
  const [info] = await query<{ time: string; version: string }>(
    'SELECT now()::text AS time, version() AS version',
  )
  const [accounts] = await query<{ count: number }>(
    'SELECT count(*) AS count FROM accounts',
  )

  return {
    ok: true,
    databaseTime: info?.time,
    postgres: info?.version,
    accountsCount: accounts?.count,
  }
})
import pg from 'pg'
import type { PoolClient, QueryResultRow } from 'pg'

function parseBigint(value: string): number {
  const n = Number(value)
  if (!Number.isSafeInteger(n)) {
    throw new Error(`bigint value ${value} is outside the safe integer range`)
  }
  return n
}

function parseNumeric(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`numeric value ${value} is outside the safe range`)
  }
  return n
}

pg.types.setTypeParser(20, parseBigint)     // int8
pg.types.setTypeParser(1700, parseNumeric)  // numeric

pg.types.setTypeParser(1082, (value: string) => value)

let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl) {
      throw new Error('NUXT_DATABASE_URL is not set. Check your .env file.')
    }
    pool = new pg.Pool({ connectionString: databaseUrl, max: 10 })
  }
  return pool
}

// Run a single query and return its rows.
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params)
  return result.rows
}

// Run several queries atomically: everything is saved, or nothing is.
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
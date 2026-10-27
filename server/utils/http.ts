import { z } from 'zod'
import type { H3Event } from 'h3'

// ---------------------------------------------------------------
// Reusable schemas
// ---------------------------------------------------------------

export const idSchema = z.coerce.number().int().positive()

// Money: integer Rials, never negative, never beyond the safe integer range
export const rialSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

// Gregorian date as 'YYYY-MM-DD' (the UI converts Jalali <-> Gregorian)
export const dateSchema = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
  },
  { message: 'Date must be a valid YYYY-MM-DD value' },
)

// ---------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------

function throwValidationError(error: z.ZodError): never {
  throw createError({
    statusCode: 400,
    message: 'Validation failed',
    data: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  })
}

export async function parseBody<T extends z.ZodType>(
  event: H3Event,
  schema: T,
): Promise<z.infer<T>> {
  const result = schema.safeParse(await readBody(event))
  if (!result.success) throwValidationError(result.error)
  return result.data
}

export function parseQuery<T extends z.ZodType>(
  event: H3Event,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(getQuery(event))
  if (!result.success) throwValidationError(result.error)
  return result.data
}

export function parseId(event: H3Event): number {
  const result = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!result.success) {
    throw createError({ statusCode: 400, message: 'Invalid id' })
  }
  return result.data
}

// ---------------------------------------------------------------
// Database errors -> HTTP errors
// ---------------------------------------------------------------

// Business rules enforced by our triggers (balance, immutability, closed
// fiscal year...) arrive as PostgreSQL error P0001 with a readable message.
export function rethrowDbError(error: unknown): never {
  const e = error as { code?: string; message?: string; constraint?: string }

  if (e?.code === 'P0001') {
    throw createError({ statusCode: 422, message: e.message ?? 'Business rule violated' })
  }
  if (e?.code === '23503') {
    throw createError({ statusCode: 400, message: 'A referenced record does not exist (account, detail account or fiscal year).' })
  }
  if (e?.code === '23514') {
    throw createError({ statusCode: 400, message: 'A value violates a database rule.', data: { constraint: e.constraint } })
  }
  if (e?.code === '23505') {
    throw createError({ statusCode: 409, message: 'This record already exists (for example, the entry was already reversed).' })
  }
  throw error
}

// ---------------------------------------------------------------
// Current user
// ---------------------------------------------------------------

// The auth middleware has already authenticated the request.
export function getCurrentUserId(event: H3Event): number {
  return getCurrentUser(event).id
}
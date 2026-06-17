import type { z } from 'zod';

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/** Parse `data` with a zod schema, returning a flat first-error message on failure. */
export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): Result<z.infer<S>> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  const message = first
    ? `${first.path.join('.') || 'input'}: ${first.message}`
    : 'Invalid input';
  return { ok: false, message };
}

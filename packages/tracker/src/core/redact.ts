/**
 * Pure redaction/scrubbing helpers used by the masking and network
 * interceptors. Everything here runs in the browser, so sensitive values are
 * redacted *before* they are ever uploaded. Kept side-effect free for testing.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 13–19 digit runs (optionally separated by spaces/dashes), matching card-like numbers.
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

const REDACTED = '[redacted]';

/** Replace emails / card-like numbers / SSNs in free text. */
export function scrubText(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(SSN_RE, '[redacted-ssn]')
    .replace(CARD_RE, (m) => (m.replace(/[ -]/g, '').length >= 13 ? '[redacted-number]' : m));
}

/** Safely compile a list of user-provided regex strings, skipping invalid ones. */
export function compileMatchers(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns) {
    if (!p) continue;
    try {
      out.push(new RegExp(p));
    } catch {
      /* ignore invalid pattern */
    }
  }
  return out;
}

/** True if `value` matches any compiled pattern. Empty list → false. */
export function matchesAny(value: string, matchers: RegExp[]): boolean {
  return matchers.some((re) => {
    re.lastIndex = 0;
    return re.test(value);
  });
}

/** Lower-cased header names to redact, for O(1) lookup. */
export function redactHeaders(
  headers: Record<string, string>,
  redactNames: string[],
): Record<string, string> {
  const deny = new Set(redactNames.map((h) => h.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = deny.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

function redactJsonValue(value: unknown, deny: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => redactJsonValue(v, deny));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deny.has(k.toLowerCase()) ? REDACTED : redactJsonValue(v, deny);
    }
    return out;
  }
  return value;
}

/**
 * Redact matching keys in a request/response body. Handles JSON objects and
 * `application/x-www-form-urlencoded` strings; other content is returned as-is.
 */
export function redactBody(body: string, redactKeys: string[]): string {
  if (!body || redactKeys.length === 0) return body;
  const deny = new Set(redactKeys.map((k) => k.toLowerCase()));

  // JSON
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(redactJsonValue(JSON.parse(body), deny));
    } catch {
      /* fall through */
    }
  }

  // form-urlencoded (key=value&key=value)
  if (body.includes('=')) {
    return body
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=');
        if (eq === -1) return pair;
        const key = pair.slice(0, eq);
        return deny.has(decodeURIComponent(key).toLowerCase()) ? `${key}=${REDACTED}` : pair;
      })
      .join('&');
  }

  return body;
}

/** Truncate a body to `maxBytes` (approx, by length). 0 → no cap. */
export function truncateBody(body: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes <= 0 || body.length <= maxBytes) return { value: body, truncated: false };
  return { value: body.slice(0, maxBytes), truncated: true };
}

/** Decide whether a content-type is in the allowlist (prefix match). */
export function contentTypeAllowed(contentType: string, allow: string[]): boolean {
  if (allow.length === 0) return true;
  const ct = contentType.toLowerCase();
  return allow.some((a) => ct.startsWith(a.toLowerCase()));
}

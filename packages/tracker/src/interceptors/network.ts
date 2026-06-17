import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { NetworkEventPayload, NetworkSettings } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';
import {
  compileMatchers,
  contentTypeAllowed,
  matchesAny,
  redactBody,
  redactHeaders,
  truncateBody,
} from '../core/redact';

interface TaggedXHR extends XMLHttpRequest {
  __rrkit?: {
    method: string;
    url: string;
    start: number;
    reqHeaders: Record<string, string>;
    reqBody?: string;
  };
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function parseRawHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const idx = line.indexOf(':');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function bodyToString(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  return undefined; // skip Blob/FormData/ArrayBuffer — opaque/binary
}

export function installNetwork(settings: NetworkSettings): () => void {
  const urlAllow = compileMatchers(settings.urlAllowlist);
  const urlBlock = compileMatchers(settings.urlBlocklist);

  const isOwn = (url: string) =>
    url.includes('/api/ingest') || url.includes('/api/config') || url.endsWith('/tracker.js');

  const shouldRecord = (url: string) => {
    if (isOwn(url)) return false;
    if (matchesAny(url, urlBlock)) return false;
    if (urlAllow.length > 0 && !matchesAny(url, urlAllow)) return false;
    return true;
  };

  const prepBody = (raw: string | undefined): { value?: string; truncated?: boolean } => {
    if (raw == null || !settings.recordBody) return {};
    const redacted = redactBody(raw, settings.redactBodyKeys);
    const { value, truncated } = truncateBody(redacted, settings.maxBodyBytes);
    return { value, truncated };
  };

  const cleanHeaders = (h: Record<string, string>): Record<string, string> | undefined =>
    settings.recordHeaders ? redactHeaders(h, settings.redactHeaders) : undefined;

  const emit = (p: NetworkEventPayload) => emitCustomEvent(CUSTOM_EVENT_TAGS.network, p);

  /* ---- fetch ---- */
  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const start = Date.now();
    const input = args[0];
    const init = args[1];
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method =
      init?.method ??
      (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') ??
      'GET';

    if (!shouldRecord(url)) return originalFetch.apply(this, args);

    const reqHeaders = cleanHeaders(
      init?.headers ? headersToObject(new Headers(init.headers)) : {},
    );
    const reqRaw = bodyToString(init?.body);
    const reqPrep = prepBody(reqRaw);

    return originalFetch.apply(this, args).then(
      async (res) => {
        let resBodyVal: string | undefined;
        let resBodyTrunc: boolean | undefined;
        let resSize: number | undefined = Number(res.headers.get('content-length')) || undefined;
        if (settings.recordBody && contentTypeAllowed(res.headers.get('content-type') ?? '', settings.contentTypeAllowlist)) {
          try {
            const text = await res.clone().text();
            resSize = resSize ?? text.length;
            const prep = prepBody(text);
            resBodyVal = prep.value;
            resBodyTrunc = prep.truncated;
          } catch {
            /* body not readable — skip */
          }
        }
        emit({
          initiator: 'fetch',
          method,
          url,
          status: res.status,
          statusText: res.statusText || undefined,
          startTs: start,
          durationMs: Date.now() - start,
          reqSize: reqRaw?.length,
          resSize,
          reqHeaders,
          resHeaders: cleanHeaders(headersToObject(res.headers)),
          reqBody: reqPrep.value,
          resBody: resBodyVal,
          reqBodyTruncated: reqPrep.truncated || undefined,
          resBodyTruncated: resBodyTrunc || undefined,
        });
        return res;
      },
      (err: unknown) => {
        emit({
          initiator: 'fetch',
          method,
          url,
          status: 0,
          startTs: start,
          durationMs: Date.now() - start,
          error: true,
          reqHeaders,
          reqBody: reqPrep.value,
          reqBodyTruncated: reqPrep.truncated || undefined,
        });
        throw err;
      },
    );
  } as typeof fetch;

  /* ---- XMLHttpRequest ---- */
  const xhrProto = XMLHttpRequest.prototype;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;
  const originalSetHeader = xhrProto.setRequestHeader;

  xhrProto.open = function (this: TaggedXHR, method: string, url: string | URL, ...rest: unknown[]) {
    this.__rrkit = {
      method: method || 'GET',
      url: typeof url === 'string' ? url : url.href,
      start: 0,
      reqHeaders: {},
    };
    // @ts-expect-error variadic passthrough to the native signature
    return originalOpen.call(this, method, url, ...rest);
  } as typeof xhrProto.open;

  xhrProto.setRequestHeader = function (this: TaggedXHR, name: string, value: string) {
    if (this.__rrkit) this.__rrkit.reqHeaders[name] = value;
    return originalSetHeader.call(this, name, value);
  } as typeof xhrProto.setRequestHeader;

  xhrProto.send = function (this: TaggedXHR, ...rest: unknown[]) {
    const meta = this.__rrkit;
    if (meta && shouldRecord(meta.url)) {
      meta.start = Date.now();
      meta.reqBody = bodyToString(rest[0]);
      this.addEventListener('loadend', () => {
        let resBodyVal: string | undefined;
        let resBodyTrunc: boolean | undefined;
        const ct = this.getResponseHeader('content-type') ?? '';
        if (settings.recordBody && this.responseType === '' && contentTypeAllowed(ct, settings.contentTypeAllowlist)) {
          try {
            const prep = prepBody(this.responseText);
            resBodyVal = prep.value;
            resBodyTrunc = prep.truncated;
          } catch {
            /* responseText unavailable for this responseType */
          }
        }
        const reqPrep = prepBody(meta.reqBody);
        emit({
          initiator: 'xhr',
          method: meta.method,
          url: meta.url,
          status: this.status,
          statusText: this.statusText || undefined,
          startTs: meta.start,
          durationMs: Date.now() - meta.start,
          error: this.status === 0,
          reqSize: meta.reqBody?.length,
          resSize: Number(this.getResponseHeader('content-length')) || undefined,
          reqHeaders: cleanHeaders(meta.reqHeaders),
          resHeaders: cleanHeaders(parseRawHeaders(this.getAllResponseHeaders())),
          reqBody: reqPrep.value,
          resBody: resBodyVal,
          reqBodyTruncated: reqPrep.truncated || undefined,
          resBodyTruncated: resBodyTrunc || undefined,
        });
      });
    }
    // @ts-expect-error variadic passthrough to the native signature
    return originalSend.apply(this, rest);
  } as typeof xhrProto.send;

  return () => {
    window.fetch = originalFetch;
    xhrProto.open = originalOpen;
    xhrProto.send = originalSend;
    xhrProto.setRequestHeader = originalSetHeader;
  };
}

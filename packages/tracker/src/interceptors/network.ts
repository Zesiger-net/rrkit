import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { NetworkEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';

interface TaggedXHR extends XMLHttpRequest {
  __rrkit?: { method: string; url: string; start: number };
}

export function installNetwork(): () => void {
  const isOwn = (url: string) =>
    url.includes('/api/ingest') || url.includes('/api/config') || url.endsWith('/tracker.js');

  const emit = (p: NetworkEventPayload) => {
    if (!isOwn(p.url)) emitCustomEvent(CUSTOM_EVENT_TAGS.network, p);
  };

  /* ---- fetch ---- */
  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const start = Date.now();
    const input = args[0];
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method =
      args[1]?.method ??
      (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') ??
      'GET';

    return originalFetch.apply(this, args).then(
      (res) => {
        emit({ initiator: 'fetch', method, url, status: res.status, startTs: start, durationMs: Date.now() - start });
        return res;
      },
      (err: unknown) => {
        emit({ initiator: 'fetch', method, url, status: 0, startTs: start, durationMs: Date.now() - start, error: true });
        throw err;
      },
    );
  } as typeof fetch;

  /* ---- XMLHttpRequest ---- */
  const xhrProto = XMLHttpRequest.prototype;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;

  xhrProto.open = function (this: TaggedXHR, method: string, url: string | URL, ...rest: unknown[]) {
    this.__rrkit = { method: method || 'GET', url: typeof url === 'string' ? url : url.href, start: 0 };
    // @ts-expect-error variadic passthrough to the native signature
    return originalOpen.call(this, method, url, ...rest);
  } as typeof xhrProto.open;

  xhrProto.send = function (this: TaggedXHR, ...rest: unknown[]) {
    const meta = this.__rrkit;
    if (meta) {
      meta.start = Date.now();
      this.addEventListener('loadend', () => {
        emit({
          initiator: 'xhr',
          method: meta.method,
          url: meta.url,
          status: this.status,
          startTs: meta.start,
          durationMs: Date.now() - meta.start,
          error: this.status === 0,
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
  };
}

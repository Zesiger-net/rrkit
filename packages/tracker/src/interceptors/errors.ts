import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { ErrorEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';

export function installErrors(): () => void {
  const onError = (e: ErrorEvent) => {
    emitCustomEvent(CUSTOM_EVENT_TAGS.error, {
      kind: 'error',
      message: e.message || 'Error',
      stack: e.error?.stack,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
    } satisfies ErrorEventPayload);
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    emitCustomEvent(CUSTOM_EVENT_TAGS.error, {
      kind: 'unhandledrejection',
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
    } satisfies ErrorEventPayload);
  };

  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

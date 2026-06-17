import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { WebVitalEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';

/**
 * Capture Core Web Vitals with the native PerformanceObserver — no web-vitals
 * dependency. LCP/CLS are finalized on page hide; FCP/TTFB are read directly.
 */
export function installVitals(): () => void {
  const observers: PerformanceObserver[] = [];
  let clsValue = 0;
  let lcpValue = 0;
  let sentFinal = false;

  const emit = (name: WebVitalEventPayload['name'], value: number) =>
    emitCustomEvent(CUSTOM_EVENT_TAGS.vital, { name, value } satisfies WebVitalEventPayload);

  const observe = (type: string, cb: (entries: PerformanceEntryList) => void) => {
    try {
      const obs = new PerformanceObserver((list) => cb(list.getEntries()));
      obs.observe({ type, buffered: true } as PerformanceObserverInit);
      observers.push(obs);
    } catch {
      /* unsupported entry type — skip */
    }
  };

  // TTFB + FCP from navigation/paint timing.
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) emit('TTFB', Math.max(0, nav.responseStart));
  } catch {
    /* ignore */
  }
  observe('paint', (entries) => {
    for (const e of entries) if (e.name === 'first-contentful-paint') emit('FCP', e.startTime);
  });

  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcpValue = last.startTime;
  });

  observe('layout-shift', (entries) => {
    for (const e of entries as Array<PerformanceEntry & { value: number; hadRecentInput?: boolean }>) {
      if (!e.hadRecentInput) clsValue += e.value;
    }
  });

  const finalize = () => {
    if (sentFinal || document.visibilityState !== 'hidden') return;
    sentFinal = true;
    if (lcpValue > 0) emit('LCP', lcpValue);
    emit('CLS', Number(clsValue.toFixed(4)));
  };
  document.addEventListener('visibilitychange', finalize);

  return () => {
    for (const o of observers) o.disconnect();
    document.removeEventListener('visibilitychange', finalize);
  };
}

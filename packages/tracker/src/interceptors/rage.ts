import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { RageEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';

const WINDOW_MS = 1000;
const RADIUS = 30;
const THRESHOLD = 3;

interface Click {
  x: number;
  y: number;
  t: number;
}

function selectorFor(el: Element | null): string {
  if (!el) return '';
  if (el.id) return `#${el.id}`;
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
}

export function installRage(): () => void {
  let recent: Click[] = [];

  const onClick = (e: MouseEvent) => {
    const now = Date.now();
    recent = recent.filter((c) => now - c.t < WINDOW_MS);
    recent.push({ x: e.clientX, y: e.clientY, t: now });

    const cluster = recent.filter(
      (c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) <= RADIUS,
    );
    if (cluster.length >= THRESHOLD) {
      emitCustomEvent(CUSTOM_EVENT_TAGS.rage, {
        x: e.clientX,
        y: e.clientY,
        count: cluster.length,
        selector: selectorFor(e.target as Element | null),
      } satisfies RageEventPayload);
      recent = [];
    }
  };

  window.addEventListener('click', onClick, true);
  return () => window.removeEventListener('click', onClick, true);
}

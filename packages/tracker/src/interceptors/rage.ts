import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { RageEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';
import { selectorFor } from './selector';

export interface RageOptions {
  threshold: number;
  windowMs: number;
  radiusPx: number;
}

interface Click {
  x: number;
  y: number;
  t: number;
}

export function installRage(opts: RageOptions): () => void {
  let recent: Click[] = [];

  const onClick = (e: MouseEvent) => {
    const now = Date.now();
    recent = recent.filter((c) => now - c.t < opts.windowMs);
    recent.push({ x: e.clientX, y: e.clientY, t: now });

    const cluster = recent.filter(
      (c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) <= opts.radiusPx,
    );
    if (cluster.length >= opts.threshold) {
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

'use client';

import { useEffect, useRef } from 'react';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';
import type { RrwebEvent } from '@rrkit/shared';

export interface PlayerApi {
  goto: (offsetMs: number) => void;
}

export function RrwebPlayer({
  events,
  onReady,
}: {
  events: RrwebEvent[];
  onReady?: (api: PlayerApi) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // rrweb-player is a Svelte component instance; type it loosely.
  const playerRef = useRef<{ goto: (n: number, play?: boolean) => void; $destroy?: () => void } | null>(
    null,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || events.length < 2) return;
    el.innerHTML = '';
    const width = Math.max(el.clientWidth || 900, 360);

    const player = new rrwebPlayer({
      target: el,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      props: {
        events: events as unknown as Record<string, unknown>[],
        width,
        height: Math.round(width * 0.58),
        autoPlay: false,
        showController: true,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    playerRef.current = player as unknown as typeof playerRef.current;
    onReady?.({
      goto: (ms: number) => {
        try {
          playerRef.current?.goto(ms, false);
        } catch {
          /* ignore */
        }
      },
    });

    return () => {
      try {
        playerRef.current?.$destroy?.();
      } catch {
        /* ignore */
      }
      if (el) el.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />;
}

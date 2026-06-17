import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { ConsoleEventPayload, ConsoleLevel } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';

export interface ConsoleOptions {
  levels: ConsoleLevel[];
  maxArgLength: number;
  captureStack: boolean;
}

function stringifyArg(arg: unknown, max: number): string {
  if (typeof arg === 'string') return arg.slice(0, max);
  try {
    return JSON.stringify(arg)?.slice(0, max) ?? String(arg);
  } catch {
    return String(arg).slice(0, max);
  }
}

export function installConsole(opts: ConsoleOptions): () => void {
  const original: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {};

  for (const level of opts.levels) {
    const fn = console[level] as ((...args: unknown[]) => void) | undefined;
    if (!fn) continue;
    original[level] = fn.bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        const serialized = args.map((a) => stringifyArg(a, opts.maxArgLength));
        if (opts.captureStack && (level === 'error' || level === 'warn')) {
          const stack = new Error().stack;
          if (stack) serialized.push(stack.split('\n').slice(2).join('\n').slice(0, opts.maxArgLength));
        }
        emitCustomEvent(CUSTOM_EVENT_TAGS.console, {
          level,
          args: serialized,
        } satisfies ConsoleEventPayload);
      } catch {
        /* never break the page's console */
      }
      original[level]?.(...args);
    };
  }

  return () => {
    for (const level of opts.levels) {
      const orig = original[level];
      if (orig) console[level] = orig;
    }
  };
}

import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { ConsoleEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';

const LEVELS: ConsoleEventPayload['level'][] = ['log', 'info', 'warn', 'error', 'debug'];
const MAX_ARG_LEN = 2000;

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg.slice(0, MAX_ARG_LEN);
  try {
    return JSON.stringify(arg)?.slice(0, MAX_ARG_LEN) ?? String(arg);
  } catch {
    return String(arg).slice(0, MAX_ARG_LEN);
  }
}

export function installConsole(): () => void {
  const original: Partial<Record<ConsoleEventPayload['level'], (...args: unknown[]) => void>> = {};

  for (const level of LEVELS) {
    const fn = console[level] as ((...args: unknown[]) => void) | undefined;
    if (!fn) continue;
    original[level] = fn.bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        emitCustomEvent(CUSTOM_EVENT_TAGS.console, {
          level,
          args: args.map(stringifyArg),
        } satisfies ConsoleEventPayload);
      } catch {
        /* never break the page's console */
      }
      original[level]?.(...args);
    };
  }

  return () => {
    for (const level of LEVELS) {
      const orig = original[level];
      if (orig) console[level] = orig;
    }
  };
}

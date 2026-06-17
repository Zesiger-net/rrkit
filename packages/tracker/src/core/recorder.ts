import { record } from 'rrweb';
import { MASK_CLASSES } from '@rrkit/shared/constants';
import type { AnyEvent } from '../types';

export interface RecorderOptions {
  maskAllInputs: boolean;
  recordCanvas: boolean;
  emit: (event: AnyEvent) => void;
}

let stop: (() => void) | undefined;

export function startRecording(opts: RecorderOptions): void {
  const handle = record({
    emit: (event) => opts.emit(event as unknown as AnyEvent),
    maskAllInputs: opts.maskAllInputs,
    maskInputOptions: { password: true },
    maskTextClass: MASK_CLASSES.mask,
    unmaskTextClass: MASK_CLASSES.unmask,
    blockClass: MASK_CLASSES.block,
    recordCanvas: opts.recordCanvas,
    sampling: { canvas: 2 },
    dataURLOptions: { type: 'image/webp', quality: 0.6 },
    collectFonts: true,
    // rrweb's option type varies across alpha releases; values above are valid.
  } as Parameters<typeof record>[0]);
  stop = typeof handle === 'function' ? handle : undefined;
}

export function stopRecording(): void {
  stop?.();
  stop = undefined;
}

/** Emit a tagged custom event into the rrweb stream (network/console/error/rage). */
export function emitCustomEvent(tag: string, payload: unknown): void {
  const fn = (record as unknown as {
    addCustomEvent?: (tag: string, payload: unknown) => void;
  }).addCustomEvent;
  fn?.(tag, payload);
}

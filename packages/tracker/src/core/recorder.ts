import { record } from 'rrweb';
import { MASK_CLASSES } from '@rrkit/shared/constants';
import type { CanvasSettings, DomSettings, Privacy, VolumeSettings } from '@rrkit/shared';
import type { AnyEvent } from '../types';
import { scrubText } from './redact';

export interface RecorderOptions {
  privacy: Privacy;
  canvasEnabled: boolean;
  canvas: CanvasSettings;
  volume: VolumeSettings;
  dom: DomSettings;
  emit: (event: AnyEvent) => void;
}

let stop: (() => void) | undefined;

/** Build rrweb's per-input-type mask map from the configured type names. */
function buildMaskInputOptions(types: string[]): Record<string, boolean> {
  const opts: Record<string, boolean> = {};
  for (const t of types) opts[t] = true;
  return opts;
}

export function startRecording(opts: RecorderOptions): void {
  const sampling: Record<string, unknown> = {
    mousemove: opts.volume.mousemoveWaitMs,
    scroll: opts.volume.scrollWaitMs,
    media: opts.volume.mediaWaitMs,
    input: opts.volume.input,
    mouseInteraction: opts.volume.mouseInteraction,
  };
  if (opts.canvasEnabled) sampling.canvas = opts.canvas.fps;

  const config = {
    emit: (event: unknown) => opts.emit(event as AnyEvent),
    maskAllInputs: opts.privacy.maskInputs,
    maskInputOptions: buildMaskInputOptions(opts.privacy.maskInputTypes),
    maskTextClass: MASK_CLASSES.mask,
    unmaskTextClass: MASK_CLASSES.unmask,
    blockClass: MASK_CLASSES.block,
    maskTextSelector: opts.privacy.maskTextSelector || undefined,
    blockSelector: opts.privacy.blockSelector || undefined,
    ignoreSelector: opts.privacy.ignoreSelector || undefined,
    maskTextFn: opts.privacy.scrubPii ? (text: string) => scrubText(text) : undefined,
    recordCanvas: opts.canvasEnabled,
    sampling,
    dataURLOptions: { type: `image/${opts.canvas.format}`, quality: opts.canvas.quality },
    inlineStylesheet: opts.dom.inlineStylesheet,
    inlineImages: opts.dom.inlineImages,
    collectFonts: opts.dom.collectFonts,
    recordCrossOriginIframes: opts.dom.recordCrossOriginIframes,
    slimDOMOptions: opts.dom.slimDom ? true : false,
    checkoutEveryNms: opts.dom.checkoutEveryNms > 0 ? opts.dom.checkoutEveryNms : undefined,
    // rrweb's option type varies across alpha releases; the values above are valid.
  } as Parameters<typeof record>[0];

  const handle = record(config);
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

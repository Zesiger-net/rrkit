import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import type { DeadClickEventPayload } from '@rrkit/shared';
import { emitCustomEvent } from '../core/recorder';
import { selectorFor } from './selector';

export interface DeadClickOptions {
  /** A click with no DOM mutation / navigation within this window is "dead". */
  windowMs: number;
}

/**
 * Detect "dead clicks": a click on a non-interactive-looking spot that produces
 * no DOM change, scroll, or navigation within the window, a strong signal the
 * user expected something to happen and nothing did.
 */
export function installDeadClick(opts: DeadClickOptions): () => void {
  let disposed = false;

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target || isInteractive(target)) return;

    const startUrl = location.href;
    let changed = false;

    const observer = new MutationObserver(() => {
      changed = true;
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const onScroll = () => {
      changed = true;
    };
    window.addEventListener('scroll', onScroll, true);

    window.setTimeout(() => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      if (disposed) return;
      const navigated = location.href !== startUrl;
      if (!changed && !navigated) {
        emitCustomEvent(CUSTOM_EVENT_TAGS.deadClick, {
          x: e.clientX,
          y: e.clientY,
          selector: selectorFor(target),
        } satisfies DeadClickEventPayload);
      }
    }, opts.windowMs);
  };

  window.addEventListener('click', onClick, true);
  return () => {
    disposed = true;
    window.removeEventListener('click', onClick, true);
  };
}

/** Heuristic: clicks on these are expected to "do something", so never dead. */
function isInteractive(el: Element): boolean {
  const interactive = el.closest(
    'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[onclick],[contenteditable]',
  );
  return interactive !== null;
}

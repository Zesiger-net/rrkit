/** Build a short, human-readable CSS selector for an element (id/class/tag). */
export function selectorFor(el: Element | null): string {
  if (!el) return '';
  if (el.id) return `#${el.id}`;
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
}

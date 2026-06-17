/** djb2 string hash → base36, for grouping like errors. */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Fingerprint a JS error so equivalent errors group into one "issue". Numbers,
 * hex addresses and source positions are normalized away so the same logical
 * error from different lines/values collapses together.
 */
export function errorFingerprint(message: string, stack?: string): string {
  const normMsg = (message || '')
    .replace(/0x[0-9a-f]+/gi, 'N')
    .replace(/\d+/g, 'N')
    .trim()
    .slice(0, 200);
  const frame =
    (stack || '')
      .split('\n')
      .map((s) => s.trim())
      .find((s) => s.startsWith('at ')) ?? '';
  const normFrame = frame.replace(/:\d+:\d+/g, '').replace(/\d+/g, 'N');
  return djb2(`${normMsg}|${normFrame}`);
}

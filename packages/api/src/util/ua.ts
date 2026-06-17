export interface UAInfo {
  browser: string | null;
  os: string | null;
  device: 'desktop' | 'mobile' | 'tablet' | null;
}

/**
 * Minimal user-agent parser, enough to label sessions by browser/OS/device.
 * Avoids a heavy dependency; covers the common cases.
 */
export function parseUA(ua: string | undefined): UAInfo {
  if (!ua) return { browser: null, os: null, device: null };

  // Browser (order matters: Edge/Opera/Brave masquerade as Chrome).
  let browser: string | null = null;
  if (/\bEdg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/\bOPR\/|\bOpera\b/.test(ua)) browser = 'Opera';
  else if (/\bSamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/\bFirefox\/|\bFxiOS\//.test(ua)) browser = 'Firefox';
  else if (/\bCriOS\//.test(ua)) browser = 'Chrome';
  else if (/\bChrome\//.test(ua)) browser = 'Chrome';
  else if (/\bVersion\/.*\bSafari\//.test(ua) || /\bSafari\//.test(ua)) browser = 'Safari';

  // OS.
  let os: string | null = null;
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  // Device type.
  let device: UAInfo['device'] = 'desktop';
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) {
    device = 'tablet';
  } else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua)) {
    device = 'mobile';
  }

  return { browser, os, device };
}

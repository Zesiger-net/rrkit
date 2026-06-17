import type { MetadataValue } from '@rrkit/shared';
import { fetchConfig } from './core/config';
import { compileMatchers, matchesAny } from './core/redact';
import { emitCustomEvent, startRecording, stopRecording } from './core/recorder';
import { clearSid, createSession, getStoredSid, storeSid } from './core/session';
import { Uploader } from './core/uploader';
import { installConsole } from './interceptors/console';
import { installDeadClick } from './interceptors/deadclick';
import { installErrors } from './interceptors/errors';
import { installNetwork } from './interceptors/network';
import { installRage } from './interceptors/rage';
import { installVitals } from './interceptors/vitals';
import type { Metadata, RrkitConfig } from './types';

const CONSENT_KEY = 'rrkit_consent';
const SAMPLE_KEY = 'rrkit_sample';

class Rrkit {
  private config: RrkitConfig | null = null;
  private sessionId: string | null = null;
  private uploader: Uploader | null = null;
  private metadata: Metadata = {};
  private teardownFns: Array<() => void> = [];
  private starting = false;
  private active = false;

  /** Configure and begin recording (idempotent). */
  init(config: RrkitConfig): void {
    if (this.config) return;
    this.config = { ...config, host: config.host.replace(/\/+$/, '') };
    void this.start();
  }

  async start(): Promise<void> {
    if (this.active || this.starting || !this.config) return;
    if (this.isExcluded()) return;
    this.starting = true;
    try {
      const cfg = this.config;
      const server = await fetchConfig(cfg.host, cfg.key);
      if (!server) {
        warn('invalid ingest key or server unreachable; not recording');
        return;
      }

      // ---- consent / privacy / sampling gates ----
      if (dntBlocked(server.privacy.respectDnt)) return;
      if (server.privacy.requireConsent && !consentGranted()) return; // resumes via optIn()
      if (urlRuleBlocked(server.sampling.urlAllowlist, server.sampling.urlBlocklist)) return;
      if (sampledOut(server.sampling.sessionSampleRate)) return;

      const privacy = {
        ...server.privacy,
        maskInputs: cfg.maskAllInputs ?? server.privacy.maskInputs,
      };

      const sessionId = await this.ensureSession(cfg.host);
      if (!sessionId) {
        warn('could not start a session; not recording');
        return;
      }
      this.sessionId = sessionId;

      this.uploader = new Uploader({
        host: cfg.host,
        key: cfg.key,
        intervalMs: cfg.uploadIntervalMs ?? server.upload.uploadIntervalMs,
        thresholdBytes: cfg.flushThresholdBytes ?? server.upload.flushThresholdBytes,
        maxBatchBytes: server.maxBatchBytes,
        getSessionId: () => this.sessionId,
        onInvalidSession: () => void this.restart(),
      });
      this.uploader.start();

      startRecording({
        privacy,
        canvasEnabled: server.features.canvas,
        canvas: server.canvas,
        volume: server.volume,
        dom: server.dom,
        emit: (event) => this.uploader?.enqueue(event),
      });

      if (server.features.console) this.teardownFns.push(installConsole(server.console));
      if (server.features.network) this.teardownFns.push(installNetwork(server.network));
      if (server.features.errors) this.teardownFns.push(installErrors());
      if (server.features.rage) {
        this.teardownFns.push(
          installRage({
            threshold: server.frustration.rageThreshold,
            windowMs: server.frustration.rageWindowMs,
            radiusPx: server.frustration.rageRadiusPx,
          }),
        );
      }
      if (server.features.deadClick) {
        this.teardownFns.push(
          installDeadClick({ windowMs: server.frustration.deadClickWindowMs }),
        );
      }
      if (server.features.webVitals) this.teardownFns.push(installVitals());

      this.attachUnload();
      this.active = true;
    } finally {
      this.starting = false;
    }
  }

  /** Associate the session with an end-user id (stored as the `user_id` metadata field). */
  identify(userId: string): void {
    this.setMetadata({ user_id: userId });
  }

  setMetadata(fields: Record<string, MetadataValue>): void {
    Object.assign(this.metadata, fields);
    this.uploader?.setMetadata(fields);
  }

  /** Grant consent and (re)start recording. Persists across page loads. */
  optIn(): void {
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch {
      /* ignore */
    }
    void this.start();
  }

  /** Revoke consent: stop recording and forget the current session. */
  optOut(): void {
    try {
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      /* ignore */
    }
    this.stop();
    clearSid();
  }

  stop(): void {
    if (!this.active) return;
    this.teardown();
    this.uploader?.flush();
    this.uploader?.end();
    this.uploader?.stop();
    this.uploader = null;
    this.active = false;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /* ---- internals ---- */

  private async ensureSession(host: string): Promise<string | null> {
    const existing = getStoredSid();
    if (existing) return existing;
    const id = await createSession(host, {
      key: this.config!.key,
      screen: { w: window.screen?.width ?? 0, h: window.screen?.height ?? 0 },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      url: location.href,
      metadata: Object.keys(this.metadata).length ? this.metadata : undefined,
    });
    if (id) storeSid(id);
    return id;
  }

  private async restart(): Promise<void> {
    clearSid();
    this.teardown();
    this.uploader?.stop();
    this.uploader?.resetSeq();
    this.uploader = null;
    this.sessionId = null;
    this.active = false;
    await this.start();
  }

  private teardown(): void {
    stopRecording();
    for (const fn of this.teardownFns) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    this.teardownFns = [];
  }

  private attachUnload(): void {
    const onHide = () => {
      if (document.visibilityState === 'hidden') this.uploader?.beaconFlush();
    };
    const onPageHide = () => {
      this.uploader?.beaconFlush();
      this.uploader?.end();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    this.teardownFns.push(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    });
  }

  private isExcluded(): boolean {
    const routes = this.config?.excludeRoutes ?? [];
    const path = location.pathname;
    return routes.some((r) => (typeof r === 'string' ? path.includes(r) : r.test(path)));
  }
}

/* ---- module-level gate helpers ---- */

function consentGranted(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function dntBlocked(respect: boolean): boolean {
  if (!respect) return false;
  const nav = navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const dnt = nav.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
}

/** True if the current path is excluded by the server-side URL rules. */
function urlRuleBlocked(allowlist: string[], blocklist: string[]): boolean {
  const path = location.pathname + location.search;
  if (matchesAny(path, compileMatchers(blocklist))) return true;
  const allow = compileMatchers(allowlist);
  if (allow.length > 0 && !matchesAny(path, allow)) return true;
  return false;
}

/** Per-session sampling decision, stable within a tab session. */
function sampledOut(rate: number): boolean {
  if (rate >= 1) return false;
  if (getStoredSid()) return false; // an existing session always continues
  try {
    const marker = sessionStorage.getItem(SAMPLE_KEY);
    if (marker === 'out') return true;
    if (marker === 'in') return false;
    const decision = Math.random() < rate ? 'in' : 'out';
    sessionStorage.setItem(SAMPLE_KEY, decision);
    return decision === 'out';
  } catch {
    return Math.random() >= rate;
  }
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[rrkit] ${message}`);
}

export const rrkit = new Rrkit();
export default rrkit;
export type { RrkitConfig } from './types';
export { emitCustomEvent };

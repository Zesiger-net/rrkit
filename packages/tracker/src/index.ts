import {
  DEFAULT_FLUSH_THRESHOLD_BYTES,
  DEFAULT_UPLOAD_INTERVAL_MS,
} from '@rrkit/shared/constants';
import type { MetadataValue } from '@rrkit/shared';
import { fetchConfig } from './core/config';
import { emitCustomEvent, startRecording, stopRecording } from './core/recorder';
import { clearSid, createSession, getStoredSid, storeSid } from './core/session';
import { Uploader } from './core/uploader';
import { installConsole } from './interceptors/console';
import { installErrors } from './interceptors/errors';
import { installNetwork } from './interceptors/network';
import { installRage } from './interceptors/rage';
import type { Metadata, RrkitConfig } from './types';

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
        warn('invalid ingest key or server unreachable — not recording');
        return;
      }

      const maskAllInputs = cfg.maskAllInputs ?? server.privacy.maskInputs;
      const sessionId = await this.ensureSession(cfg.host);
      if (!sessionId) {
        warn('could not start a session — not recording');
        return;
      }
      this.sessionId = sessionId;

      this.uploader = new Uploader({
        host: cfg.host,
        key: cfg.key,
        intervalMs: cfg.uploadIntervalMs ?? server.uploadIntervalMs ?? DEFAULT_UPLOAD_INTERVAL_MS,
        thresholdBytes:
          cfg.flushThresholdBytes ?? server.flushThresholdBytes ?? DEFAULT_FLUSH_THRESHOLD_BYTES,
        getSessionId: () => this.sessionId,
        onInvalidSession: () => void this.restart(),
      });
      this.uploader.start();

      startRecording({
        maskAllInputs,
        recordCanvas: server.features.canvas,
        emit: (event) => this.uploader?.enqueue(event),
      });

      if (server.features.console) this.teardownFns.push(installConsole());
      if (server.features.network) this.teardownFns.push(installNetwork());
      if (server.features.errors) {
        this.teardownFns.push(installErrors());
        this.teardownFns.push(installRage());
      }

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

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[rrkit] ${message}`);
}

export const rrkit = new Rrkit();
export default rrkit;
export type { RrkitConfig } from './types';
export { emitCustomEvent };

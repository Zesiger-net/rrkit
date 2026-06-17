import { rrkit } from './index';

// IIFE entry served at /tracker.js. The loader snippet sets window.rrkitConfig
// before injecting this script (async-safe; document.currentScript is null for async).
interface RrkitGlobal {
  rrkit: typeof rrkit;
  rrkitConfig?: { key?: string; host?: string };
}

const w = window as unknown as RrkitGlobal;
w.rrkit = rrkit;

const cfg = w.rrkitConfig;
if (cfg?.key && cfg?.host) {
  rrkit.init({ key: cfg.key, host: cfg.host });
}

export { rrkit };

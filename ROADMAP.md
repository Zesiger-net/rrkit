# rrkit Roadmap

rrkit's goal is to be the session-replay tool that is **trivial to install but exhaustively configurable**: one container, your own S3 bucket, one SQLite file — and an admin dashboard where *every* recording knob is exposed. This roadmap is the plan for getting there.

It is organised into phases. Earlier phases deliver the highest-leverage, most-requested control; later phases add analysis and stretch features. Nothing here requires leaving the minimal stack.

---

## Implementation status

Most of this roadmap is **shipped** — built end-to-end (shared contract → API → tracker → dashboard), typechecked, and covered by the test suite (`pnpm test`).

**Shipped ✅**
- **Phase 1** — all granular capture settings: canvas fps/quality/format, configurable rage thresholds, dead-click detection, rrweb volume/sampling, DOM fidelity (slimDOM, inline images, fonts, cross-origin iframes, `checkoutEveryNms`), selector-based masking + PII scrub, console levels/truncation/stack, upload cadence, and the session-keep policy — all dashboard-driven via `/api/config`.
- **Phase 2** — network headers/bodies capture (opt-in, off by default) with URL allow/deny, size caps, content-type allowlist and client-side header + body-key redaction; dashboard network viewer with headers/bodies + **copy-as-cURL**. Retention ↔ **S3 lifecycle** sync on change + boot, with a status display and graceful fallback.
- **Phase 3** — DNT/GPC honoring, `optIn`/`optOut` consent gating, session sample rate, URL include/exclude rules (tracker); server-side IP drop/anonymize; right-to-erasure (delete-by-metadata) with dashboard UI.
- **Phase 4 (partial)** — advanced filters (pre-existing + extended), session star/note triage, session JSON export.
- **Phase 5** — errors/rage/dead-clicks indexed into SQLite on ingest; grouped **issues** + **frustration** dashboard; **webhook alerts** job.
- **Phase 6 (partial)** — Web Vitals capture (LCP/CLS/FCP/TTFB), `/metrics` (Prometheus), ingest-key rotation, login lockout, ingest-origin allowlist, per-IP ingest rate limit.

**Deferred ⏳** (documented, not faked — these need deeper rework than the rest):
- `dom.pack` rrweb compression — rrweb 2.0.1 ships only the `packFn`/`unpackFn` *slots*, and packing turns each event from an object into a string, which breaks the JSON ingest schema, S3 storage, and the dashboard's console/network panels. The setting is persisted but currently inert.
- Synced-timeline player overlay and shareable signed links (Phase 4).
- Heatmaps / scroll maps, funnels / path analysis, HAR export (Phase 6).

---

## Guiding principles

These constraints shape every item below. A feature that violates one is out of scope (see [Non-goals](#non-goals)).

1. **Stays one container.** SQLite + an S3-compatible bucket + in-process background jobs. No Postgres, ClickHouse, Redis, Kafka, or external queues.
2. **Single-tenant.** One instance, one admin, one ingest key. No projects/teams/RBAC/SSO.
3. **The dashboard is the single source of truth.** All capture configuration is set in the dashboard, persisted in the `settings` table, and pushed to trackers via `GET /api/config`. The SDK stays minimal — `key` + `host`. Developers do not hand-tune knobs in code.
4. **Privacy-first.** Anything that could capture sensitive data (network bodies, unmasked text) is **off by default** and gated behind explicit, granular controls. Redaction happens in the browser wherever possible, so raw values never leave the user's device.
5. **Heavy features are opt-in and degrade gracefully.** If a bucket forbids lifecycle rules, if a provider lacks a capability, if volume outgrows SQLite — rrkit warns and falls back rather than breaking.

### How configuration flows today

```
Dashboard (admin)  ──PUT──►  settings table (SQLite)  ──GET /api/config──►  tracker  ──►  rrweb record(...)
```

Every "granular setting" item follows the same path: add a zod schema in `packages/shared/src/settings.ts`, a getter/setter in `packages/api/src/db/settings.repo.ts`, a read/write route in `packages/api/src/routes/settings.ts`, a control in `packages/dashboard/components/settings-view.tsx`, a field in the `/api/config` payload (`packages/api/src/routes/config.ts`), and finally consumption in the tracker. The plan reuses this pipeline rather than inventing new ones.

**Status legend:** 🎯 Planned · 🧪 Stretch (revisit if scale/value justifies)

---

## Phase 1 — Granular capture settings + deployment docs

The flagship phase: turn the four boolean toggles into full, dashboard-driven control over what and how rrkit records. Plus the deployment documentation the project is currently missing.

### 1.0 Settings backbone (do once, reused everywhere) 🎯

A single piece of plumbing unlocks every knob below.

- **What:** Introduce grouped capture-settings schemas — `CaptureCanvas`, `CaptureFrustration`, `CaptureVolume`, `CaptureDom`, `CaptureMasking`, `CaptureConsole`, `CaptureUpload`, `SessionPolicy` — each with a `DEFAULT_*` that mirrors **today's hardcoded values**, so upgrading changes nothing until an admin edits a setting.
- **Where:** `packages/shared/src/settings.ts` (schemas) · `packages/api/src/db/settings.repo.ts` (new `SettingKey`s + getters/setters) · `packages/api/src/routes/settings.ts` (read/write) · `packages/api/src/routes/config.ts` + `TrackerConfigResponse` in shared (widen the payload) · `packages/dashboard/components/settings-view.tsx` (collapsible **Advanced** sections in the Capture tab).
- **Then:** replace the hardcoded literals in `recorder.ts`, `rage.ts`, `network.ts`, `uploader.ts`, and `sessionService.ts` with config-driven values.

### 1.1 Canvas recording controls 🎯

- **What:** Make canvas recording fully tunable instead of on/off only.
- **Why:** Canvas/WebGL capture is the heaviest recording mode; users need to trade fidelity against bandwidth and storage.
- **Where:** `packages/tracker/src/core/recorder.ts:21-23` (currently `sampling:{canvas:2}`, `dataURLOptions:{type:'image/webp',quality:0.6}`).
- **Knobs:**
  - **Frame rate / sampling** — capture every Nth frame or N fps. *Today: every 2nd frame. Reference: PostHog default 4 fps.*
  - **Quality** — `0.0–1.0`. *Today: `0.6`. Reference: PostHog default `0.4`.*
  - **Image format** — `webp` / `jpeg` / `png`. *Today: `webp`.*
  - **Max snapshot dimension** (downscale large canvases) — 🧪.

### 1.2 Frustration signals: configurable rage + dead clicks 🎯

- **What:** Pull rage detection out of the `errors` toggle into its own feature, expose its thresholds, and add dead-click detection.
- **Why:** "More options on rage clicks" was an explicit request; frustration signals are a core session-replay differentiator (OpenReplay/PostHog both surface rage **and** dead clicks).
- **Where:** `packages/tracker/src/interceptors/rage.ts:5-7` (hardcoded `WINDOW_MS=1000`, `RADIUS=30`, `THRESHOLD=3`); new `packages/tracker/src/interceptors/deadclick.ts`; new custom-event tag in `packages/shared/src/constants.ts`.
- **Knobs:**
  - Rage: **click threshold** (today 3), **time window ms** (today 1000), **radius px** (today 30), independent on/off.
  - Dead click: a click that produces **no DOM mutation and no navigation** within N ms → emit event. Configurable window and on/off.

### 1.3 Volume / sampling controls 🎯

- **What:** Expose rrweb's `sampling` options so admins can throttle high-frequency events.
- **Why:** Directly controls payload size, bandwidth, and S3 cost on busy pages.
- **Where:** `recorder.ts` `sampling` block.
- **Knobs:** `mousemove` / `mousemoveWait`, `scroll`, `input` (`all` | `last`), `media`, `mouseInteraction` toggles.

### 1.4 DOM fidelity & storage efficiency 🎯

- **What:** Expose the rrweb snapshot-fidelity options, plus a full-snapshot interval and on-the-wire compression.
- **Why:** Trades replay completeness against size; `checkoutEveryNms` keeps long sessions replayable and bounds player memory; `packFn` meaningfully shrinks S3 usage.
- **Where:** `recorder.ts` (record options) + `packages/dashboard/components/rrweb-player.tsx` (must `unpack` if packing is enabled).
- **Knobs:** `slimDOMOptions` (strip comments/scripts/meta), `inlineStylesheet`, `inlineImages`, `collectFonts` (*today forced `true`*), `recordCrossOriginIframes`, `ignoreCSSAttributes`, **`checkoutEveryNms`** (full-snapshot interval), **`packFn` compression** (rrweb pack/unpack).

### 1.5 Masking granularity 🎯

- **What:** Go beyond the three fixed `rrkit-*` CSS classes and the single `maskInputs` flag.
- **Why:** Real apps need to mask/block by selector and to scrub PII patterns without code changes.
- **Where:** `recorder.ts:16-20`, `MASK_CLASSES` in `packages/shared/src/constants.ts`, `PrivacySchema` in `packages/shared/src/settings.ts`.
- **Knobs:** admin-editable **CSS selector lists** for mask / block / ignore; per-input-type `maskInputOptions` (today only `password:true`); a **regex PII scrubber** (`maskTextFn`) for emails, card numbers, etc. (foundation reused by network redaction in Phase 2).

### 1.6 Console capture controls 🎯

- **What:** Configure which console output is captured and how much.
- **Where:** `packages/tracker/src/interceptors/console.ts`.
- **Knobs:** which **levels** (`log/info/warn/error/debug`), **max arg length / truncation**, optional **stack capture** — aligning with rrweb's console plugin (`level`, `lengthThreshold`, `stringifyOptions`).

### 1.7 Upload / ingest tuning (moved into the dashboard) 🎯

- **What:** Surface the batching knobs in the dashboard (they currently live as SDK overrides / constants — counter to the dashboard-as-source-of-truth principle).
- **Where:** `packages/tracker/src/core/uploader.ts`, `packages/shared/src/constants.ts` (`DEFAULT_UPLOAD_INTERVAL_MS=5000`, `DEFAULT_FLUSH_THRESHOLD_BYTES=1 MB`, `MAX_BATCH_BYTES=8 MB`).
- **Knobs:** `uploadIntervalMs`, `flushThresholdBytes`, `maxBatchBytes`; optional **gzip** of upload payloads — 🧪.

### 1.8 Session-keep policy 🎯

- **What:** Expose the thresholds that decide whether a session is worth keeping.
- **Where:** `packages/api/src/services/sessionService.ts:13-15` (`MIN_SESSION_DURATION_MS=20000`, `MIN_SESSION_EVENT_COUNT=30`).
- **Knobs:** minimum duration, minimum event count, idle timeout, max session length.

### 1.9 Deployment documentation 🎯

Shipped in this phase because "simple to install" demands it. See the README rewrite: a prominent **reverse-proxy / TLS** section (why it's required, Caddy + nginx examples), an **environment-variable** table, a `.env.example`, and a **troubleshooting** section. (Details in the repo `README.md`.)

---

## Phase 2 — Network bodies + Retention ↔ S3

The other two explicitly requested features.

### 2.1 Network capture: headers, bodies, redaction 🎯

- **What:** Upgrade network capture from metadata-only to full request/response capture with airtight privacy controls.
- **Why:** Bodies are the single most valuable debugging signal and the most requested missing feature — but also the biggest privacy/storage risk, so every control defaults safe.
- **Where:** `packages/tracker/src/interceptors/network.ts` (today captures only `initiator/method/url/status/startTs/durationMs/error`; `reqSize`/`resSize` are typed but never populated). **Option:** adopt rrweb's official network plugin, which already implements `recordHeaders` / `recordBody` / `recordInitialRequests` / `ignoreRequestFn` / `maskRequestFn`.
- **Knobs (all bodies/headers OFF by default):**
  - **Headers** — capture request/response headers via allowlist; **default-redact** `authorization`, `cookie`, `set-cookie`.
  - **Bodies** — opt-in, with **max body size cap** (truncate beyond N KB), **content-type allowlist** (json/text/form; skip binary), **URL allow/deny** regex lists (e.g. exclude `/auth`, `/payment`), **field-level redaction** (key names / JSON paths: `password`, `token`, `ssn`, `card`).
  - **Client-side PII scrub** — redaction runs in the browser (PostHog's `maskCapturedNetworkRequestFn` pattern) so raw bodies never leave the device.
  - Populate `reqSize` / `resSize`; add status text.
- **Dashboard:** render headers/bodies in the network panel; **copy-as-cURL**. Document the storage trade-off (bodies bloat S3 → tune retention).

### 2.2 Retention ↔ S3 lifecycle sync 🎯

- **What:** When retention changes, rrkit also writes the matching expiration rule directly to the S3 bucket — so storage is governed at the source, not only by rrkit's deletion job.
- **Why:** Today the hourly job is the *only* thing deleting objects; if rrkit is down or a session is orphaned, storage grows unbounded. A bucket lifecycle rule is belt-and-suspenders and the provider-native way to expire data.
- **Where:** add `getLifecycle` / `putLifecycle` to `packages/api/src/services/s3.service.ts` (`GetBucketLifecycleConfiguration` / `PutBucketLifecycleConfiguration`); reconcile on retention `PUT` (`packages/api/src/routes/settings.ts`) and on boot (`packages/api/src/index.ts`). Keep the hourly job (`packages/api/src/jobs/scheduler.ts:45-55`) for DB-row pruning and as a fallback.
- **Behaviour:** write a single rrkit-owned, idempotent rule (`ID: rrkit-retention`, whole-bucket prefix, `Expiration.Days = retention.days`) **without clobbering** unrelated rules. Single global N-days (no tiers/pins).
- **Dashboard:** show the bucket's current lifecycle status; warn if out of sync or if the credentials lack `s3:PutLifecycleConfiguration` (MinIO and Cloudflare R2 support lifecycle; some providers/policies don't — degrade gracefully to job-only).

### 2.3 Storage insight 🧪

- **What:** Track bytes stored per session (increment a column as chunks are written) and show total usage + rough cost in the dashboard, so retention/quality settings can be tuned against real numbers.
- **Where:** `packages/api/src/routes/ingest.ts`, `sessions` table, Storage settings tab.

---

## Phase 3 — Privacy & consent + Sampling & recording rules

### 3.1 Privacy & consent 🎯

- **Do-Not-Track / Global Privacy Control** — optional setting to honour `navigator.doNotTrack` / GPC.
- **Consent gating** — `rrkit.optIn()` / `rrkit.optOut()` SDK methods plus a "require consent before recording" mode; cookieless option.
- **IP handling** — option to not store the IP at all, or to anonymise it (drop the last octet) for GDPR. *Today the raw IP is stored on every session.*
- **Right-to-erasure (DSAR)** — delete-by-user: purge every session matching a `user_id` / metadata value in one action. Builds on the existing `discardSession` (`packages/api/src/services/sessionService.ts:24`).
- **PII masking presets** — reuse the Phase-1.5 regex scrubber across both DOM text and network bodies.

### 3.2 Sampling & recording rules 🎯

Dashboard-controlled, delivered via `/api/config`.

- **Session sample rate** — record only X% of sessions. *Reference: PostHog `sampling.sessionRecording` (e.g. `0.2`).*
- **Record-on-error / buffer mode** — keep the last N seconds buffered in memory (via `checkoutEveryNms` from Phase 1.4) and only persist the session if an error / rage / dead-click fires. Captures high-signal sessions while discarding noise.
- **Conditional capture by URL** — move the SDK's `excludeRoutes` server-side and add both include and exclude lists.
- **Conditional capture by metadata** — record only matching users/plans (e.g. debug one complaining customer by `user_id`).
- **Minimum duration/events to persist** — surfaced here too (shares the Phase-1.8 session policy).

---

## Phase 4 — Replay & search UX

- **Synced timeline** 🎯 — render console / network / error / rage / dead-click markers on one scrubber track; click a marker to jump to that moment; "jump to next error/rage." Builds on `packages/dashboard/components/rrweb-player.tsx`.
- **Player upgrades** 🎯 — playback speed, skip-inactivity, fullscreen, keyboard shortcuts.
- **Advanced search & saved filters** 🎯 — structured queries over the `sessions` table: `duration>30s`, `has:error`, `has:rage`, `url contains …`, `metadata k=v`, plus the existing browser/OS/device facets; save them as named segments. Extends `packages/api/src/db/sessions.repo.ts` filtering.
- **Shareable links** 🎯 — signed, time-limited, read-only link to a single session (a tokenised bypass for one session id, since the product is otherwise admin-only).
- **Notes, stars & in-session filters** 🎯 — star/bookmark and annotate sessions (new SQLite columns); filter a session's event list (network by status, console by level).

---

## Phase 5 — Errors, frustration & alerts

Deliberately later — these depend on indexing event data into SQLite.

- **Index errors / rage / dead-clicks into SQLite on ingest** 🎯 — extract these from the event chunks at write time so they're queryable across sessions. Prerequisite for everything else here.
- **Issue grouping** 🎯 — fingerprint errors by message + stack; group with counts, first/last seen, and affected sessions.
- **Frustration dashboard** 🎯 — rage / dead-click / error-rate trends over time.
- **Alerts** 🎯 — webhook / Slack notifications on error spikes, new issues, or rage clusters. Implemented as an in-process check inside the existing job scheduler plus an outbound HTTP call — no queue, stays strictly minimal.

---

## Phase 6 — Analytics-lite & portability (Stretch)

Feasible on SQLite + S3, but only at modest volume — flagged 🧪 and gated behind a clear "may strain at scale" note.

- **Heatmaps / scroll maps** 🧪 — aggregate click coordinates and scroll depth per URL into SQLite; overlay them in the dashboard.
- **Web Vitals** 🧪 — capture LCP / CLS / INP / TTFB via `PerformanceObserver` in the tracker; show per-session values and trends.
- **Funnels / path analysis** 🧪 — requires indexed pageview events; small-scale only.
- **Export & portability** 🧪 — a session as JSON or a standalone self-contained HTML replay; network as HAR; settings import/export. (Server-side MP4 rendering is explicitly **out** — too heavy for the minimal stack.)
- **Optional `/metrics`** 🧪 — Prometheus text format (no new dependency) exposing sessions ingested and storage used.
- **Security hardening backlog** 🎯 — ingest-origin allowlist (today CORS is `origin:true`), ingest-key rotation without losing history, per-key/IP ingest rate limits, login lockout.

---

## Non-goals

Called out so they're a deliberate "no," not an oversight:

- **Multi-tenancy** — projects, teams, workspaces, RBAC, SSO. (Stays single-tenant.)
- **External datastores** — Postgres / ClickHouse / Redis-backed analytics. (Stays SQLite + S3.)
- **Tiered / conditional retention** — keeping some sessions longer than others. (Single global N-days.)
- **Server-side video rendering** (MP4 export).
- **Feature flags, A/B testing, surveys** — out of session-replay scope.

---

## Comparable tools we drew from

- **rrweb core** `record()` options — the basis for Phases 1.1–1.6 (`sampling`, `slimDOMOptions`, `maskInputOptions`, `checkoutEveryNms`, `packFn`, `recordCanvas`, `dataURLOptions`, plugins).
- **rrweb network plugin** — `recordHeaders`, `recordBody`, `recordInitialRequests`, `ignoreRequestFn`, `maskRequestFn` (Phase 2.1).
- **PostHog session replay** — `canvasFps` (default 4), `canvasQuality` (default 0.4), `sampling.sessionRecording` (e.g. 0.2), `minimumDurationMilliseconds`, `maskCapturedNetworkRequestFn`.
- **OpenReplay** — frustration signals (rage + dead clicks), integrated devtools/network panel, copy-as-cURL.
- **Microsoft Clarity** — heatmaps and frustration metrics as first-class views.

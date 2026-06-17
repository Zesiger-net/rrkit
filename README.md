# rrkit

Self-hosted **session replay** — watch real recordings of how people use your site, with console logs, network requests and errors alongside the video. Powered by [rrweb](https://github.com/rrweb-io/rrweb).

rrkit is a single Docker container. The only thing it stores on your host is **one SQLite file**; every recording lives in **your own S3 bucket**. Everything else — admin password, S3 credentials, what to capture, retention — is configured in the dashboard. No Postgres, no Redis, no Kafka.

---

## Quick start

```bash
# 1. Grab the compose file
curl -O https://raw.githubusercontent.com/<you>/rrkit/main/docker-compose.yml

# 2. Start it
docker compose up -d

# 3. Open the dashboard
open http://localhost:3000
```

On first launch you'll be guided through a short setup wizard:

1. **Admin password** — protects the dashboard (single admin account).
2. **S3 bucket** — your bucket's credentials. rrkit verifies them before continuing.
3. **Session metadata** — the custom fields your app will attach to sessions (e.g. `user_id`, `user_email`, `plan`).

That's it. The app is live.

> Don't have an S3 bucket handy? Use the dev stack with a bundled MinIO:
> `docker compose -f docker-compose.dev.yml up --build` — see the file for the credentials to paste into the wizard.

---

## Install the tracker

Open **Settings → Integration** in the dashboard to get your snippet with the key already filled in. Two options:

### Script tag (any site)

Paste before `</head>`:

```html
<script>
  window.rrkitConfig = { key: "YOUR_INGEST_KEY", host: "https://your-rrkit-host" };
  (function (h) {
    var s = document.createElement("script");
    s.async = 1;
    s.src = h + "/tracker.js";
    document.head.appendChild(s);
  })("https://your-rrkit-host");
</script>
```

### npm (React, Vue, bundlers)

```bash
npm install @rrkit/tracker
```

```js
import { rrkit } from "@rrkit/tracker";

rrkit.init({ key: "YOUR_INGEST_KEY", host: "https://your-rrkit-host" });

// Optional: attach a user + metadata to the session
rrkit.identify("user-123");
rrkit.setMetadata({ user_email: "jane@acme.com", plan: "pro" });
```

The first session shows up in the dashboard within a few seconds of someone visiting your site.

---

## Capture & privacy

Under **Settings → Capture** you control what every tracker records (the tracker reads this on load):

- **Console logs** — `console.log/info/warn/error/debug`
- **Network requests** — `fetch`/XHR URL, status and timing
- **Canvas / WebGL** — `<canvas>` content (heavier on bandwidth)
- **Errors & rage clicks** — JS exceptions and rapid repeated clicks

**Inputs are masked by default.** Text typed into inputs is hidden in recordings. To fine-tune:

| Class           | Effect                                   |
| --------------- | ---------------------------------------- |
| `rrkit-unmask`  | Reveal an element that would be masked   |
| `rrkit-mask`    | Force-mask an element's text             |
| `rrkit-block`   | Don't record the element at all          |

---

## Configuration

Everything is in the dashboard:

- **Storage** — any S3-compatible provider: AWS S3, Cloudflare R2, Backblaze B2, MinIO, Contabo, … Set a custom **endpoint** and enable **path-style** for non-AWS providers. Credentials are stored server-side and never sent to the browser.
- **Retention** — auto-delete sessions (DB rows + S3 objects) older than N days (default 30).
- **Metadata fields** — define/rename the fields your SDK attaches; mark fields **filterable** to search by them in the sessions list.

---

## Backups

- **Metadata + settings:** the single file `./data/rrkit.db` (copy it while the container is stopped, or use SQLite's online backup).
- **Recordings:** live in your S3 bucket — back it up with your provider's tooling.

## Updating

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on boot.

---

## Architecture

```
Customer site ──(rrweb batches, ingest key)──►  ┌──────── rrkit container (one port) ────────┐
  <script src=/tracker.js>                       │ Fastify API                                │
                                                 │  • /api/ingest/*  → S3 (event chunks)      │
  Admin browser ──(dashboard, cookie)─────────►  │  • /api/sessions/* (admin)                 │
                                                 │  • serves the dashboard SPA + /tracker.js  │
                                                 │ SQLite → /data/rrkit.db  (only host mount) │
                                                 └────────────────────────────────────────────┘
                                                            │
                                                            └──►  Your S3 bucket (recordings)
```

- **SQLite** holds settings + session metadata. Custom metadata fields become indexed columns so filtering stays fast.
- **S3** holds the rrweb event payloads as immutable chunks (`{sessionId}/events/chunk-*.json`).
- The dashboard is a static Next.js export served by Fastify, so it's all one origin and one process.

---

## Development

Requires Node 22 and pnpm 9.

```bash
pnpm install
pnpm build:shared            # build the shared contracts first

# run the API (port 3000) and the dashboard (port 3001, proxies /api → 3000)
pnpm dev:api
pnpm dev:dashboard
```

Packages:

| Package             | What it is                                              |
| ------------------- | ------------------------------------------------------- |
| `@rrkit/shared`     | Shared types + zod contracts                            |
| `@rrkit/api`        | Fastify server (ingestion, sessions, setup, auth, jobs) |
| `@rrkit/tracker`    | Browser SDK (npm package + `/tracker.js` IIFE bundle)   |
| `@rrkit/dashboard`  | Next.js static-export dashboard                         |

Build everything: `pnpm build`.

## Building & publishing the image

CI (`.github/workflows/ci.yml`) typechecks and builds on every push/PR.

Pushing a tag like `v0.1.0` triggers `.github/workflows/release.yml`, which builds a multi-arch image and pushes it to Docker Hub. Set two repository secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

Build locally:

```bash
docker build -t rrkit .
docker run -p 3000:3000 -v "$(pwd)/data:/data" rrkit
```

---

## License

MIT

# rrkit

Self-hosted **session replay**. Watch real recordings of how people use your site, with console logs, network requests, errors and rage clicks alongside the video. Powered by [rrweb](https://github.com/rrweb-io/rrweb).

rrkit is **one Docker container**. The only thing it keeps on your host is **a single SQLite file**; every recording lives in **your own S3 bucket**. Everything else (admin password, S3 credentials, what to capture, retention) is configured in the dashboard. No Postgres, no Redis, no Kafka.

---

## Requirements

- **Docker** (with Docker Compose).
- **An S3-compatible bucket**: AWS S3, Cloudflare R2, Backblaze B2, MinIO, Contabo, … (or use the bundled MinIO to evaluate).
- **For production: a domain and a reverse proxy that terminates HTTPS.** rrkit serves plain HTTP and is not TLS-aware on its own. See [Running in production](#running-in-production-reverse-proxy--https) below. This is required, not optional.

---

## Try it locally

> This runs rrkit on plain HTTP, which is fine for evaluating on your own machine but **not** for production. For a real deployment, jump to [Running in production](#running-in-production-reverse-proxy--https).

```bash
# 1. Grab the compose file
curl -O https://raw.githubusercontent.com/<you>/rrkit/main/docker-compose.yml

# 2. Start it
docker compose up -d

# 3. Open the dashboard
open http://localhost:3000
```

On first launch a short setup wizard guides you through:

1. **Admin password**: protects the dashboard (single admin account).
2. **S3 bucket**: your bucket's credentials. rrkit verifies them before continuing.
3. **Session metadata**: the custom fields your app will attach to sessions (e.g. `user_id`, `user_email`, `plan`).

That's it. The app is live.

> Don't have a bucket handy? Use the dev stack with a bundled MinIO:
> `docker compose -f docker-compose.dev.yml up --build`. See the file for the credentials to paste into the wizard.

---

## Running in production (reverse proxy + HTTPS)

**rrkit must sit behind a reverse proxy that terminates TLS.** It listens on plain HTTP (`:3000`) and does not handle certificates itself. A proxy is required for three concrete reasons:

1. **Browsers block mixed content.** Your site is served over HTTPS, so it cannot load an HTTP tracker script or send recordings to an HTTP endpoint. The rrkit host has to be HTTPS.
2. **Security.** Without TLS the admin password and every recording travel in cleartext. The dashboard login cookie is also flagged `Secure` only over HTTPS, so it should not be used unencrypted in production.
3. **Certificates + a stable hostname** are what the tracker snippet points at (`host: "https://your-rrkit-host"`).

rrkit already runs with `trustProxy` enabled and sets the auth cookie with `secure: 'auto'`, so it marks the cookie `Secure` based on the scheme it sees. So your proxy **must forward `X-Forwarded-Proto`** to match the scheme the browser actually uses (HTTPS); otherwise the cookie's `Secure` flag and the recorded client IPs will be wrong. (This is also why the local-HTTP quick start above works without a proxy: rrkit sees plain HTTP and omits the `Secure` flag.)

### Caddy (recommended, automatic HTTPS)

Caddy obtains and renews Let's Encrypt certificates for you. `Caddyfile`:

```caddy
rrkit.example.com {
    reverse_proxy localhost:3000
    request_body {
        max_size 10MB
    }
}
```

That's the whole config. Caddy forwards `X-Forwarded-Proto`/`-For` automatically.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name rrkit.example.com;

    ssl_certificate     /etc/letsencrypt/live/rrkit.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rrkit.example.com/privkey.pem;

    # Ingest batches can be several MB, so this must exceed rrkit's 8 MB batch limit.
    client_max_body_size 10m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;   # required for secure cookies
        proxy_read_timeout 120s;
    }
}
```

### Proxy checklist

- **Forward `X-Forwarded-Proto`**: without it the secure cookie is never set and login fails.
- **Raise the max request body size to ~10 MB**: rrkit accepts ingest batches up to 8 MB; the default proxy limit (often 1 MB) will reject them with `413`.
- **Generous read timeouts**: large initial DOM snapshots can take a moment to upload.
- **CORS is already handled.** The dashboard is same-origin with the API, and the tracker's cross-origin requests are allowed by rrkit. You don't configure CORS in the proxy.

### Content Security Policy on the recorded site

If the site you're recording uses a strict CSP, allow the rrkit host so the tracker can load and send data:

```
script-src  https://rrkit.example.com;
connect-src https://rrkit.example.com;
```

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

Under **Settings → Capture** you control, in depth, what every tracker records (the tracker reads this on load). The common toggles are front and centre; an **Advanced** area exposes the fine-grained knobs:

- **Console logs**: choose levels, truncation length, optional stack traces
- **Network requests**: URL/status/timing always; optionally **headers and bodies** (off by default) with URL allow/deny, size caps, content-type allowlist, and header/field **redaction that happens in the browser**
- **Canvas / WebGL**: frame rate, image quality and format
- **Errors, rage & dead clicks**: JS exceptions, configurable rage-click thresholds, and dead-click detection
- **Web Vitals**: LCP / CLS / FCP / TTFB (opt-in)
- **Volume / DOM**: mouse-move/scroll/input sampling, slim-DOM, inline images, full-snapshot interval, and more
- **Sampling rules**: record a percentage of sessions, or restrict by URL

**Inputs are masked by default.** Text typed into inputs is hidden in recordings. Beyond the classes below you can configure mask/block/ignore **CSS selectors** and a built-in **PII scrubber** in Settings → Capture:

| Class           | Effect                                   |
| --------------- | ---------------------------------------- |
| `rrkit-unmask`  | Reveal an element that would be masked   |
| `rrkit-mask`    | Force-mask an element's text             |
| `rrkit-block`   | Don't record the element at all          |

**Privacy & consent.** Settings include honoring Do-Not-Track / Global Privacy Control, a consent gate (`rrkit.optIn()` / `rrkit.optOut()`), and dropping or anonymizing stored IPs. For GDPR erasure, Settings → Privacy can delete every session for a given user.

See [ROADMAP.md](ROADMAP.md) for the full feature list and what's still planned.

---

## Configuration

Everything is in the dashboard:

- **Storage**: any S3-compatible provider: AWS S3, Cloudflare R2, Backblaze B2, MinIO, Contabo, … Set a custom **endpoint** and enable **path-style** for non-AWS providers. Credentials are stored server-side and never sent to the browser.
- **Retention**: auto-delete sessions (DB rows + S3 objects) older than N days (default 30). rrkit also writes a matching **S3 lifecycle expiry rule** to your bucket so objects expire at the source; the Storage tab shows whether it's in sync.
- **Metadata fields**: define/rename the fields your SDK attaches; mark fields **filterable** to search by them in the sessions list.
- **Issues & frustration**: JS errors are grouped into issues across sessions, alongside rage- and dead-click counts (see the **Issues** tab). Optionally send **webhook/Slack alerts** on error spikes, new issues, or rage clusters.
- **Monitoring**: a Prometheus-compatible `/api/metrics` endpoint exposes aggregate session/issue counts (restrict it at your reverse proxy if needed).

---

## Environment variables

rrkit is zero-config out of the box; these all have sensible defaults. Override them in the compose file's `environment:` block if needed.

| Variable             | Default                | Purpose                                                        |
| -------------------- | ---------------------- | -------------------------------------------------------------- |
| `RRKIT_PORT`         | `3000`                 | Port the server listens on.                                    |
| `RRKIT_HOST`         | `0.0.0.0`              | Bind address.                                                  |
| `RRKIT_DB_PATH`      | `/data/rrkit.db`       | Path to the SQLite database (the one host-mounted file).       |
| `RRKIT_LOG_LEVEL`    | `info`                 | Log verbosity (`fatal`/`error`/`warn`/`info`/`debug`/`trace`). |
| `RRKIT_STATIC_DIR`   | *(bundled)*            | Override the dashboard static-export directory. Rarely needed. |
| `RRKIT_TRACKER_PATH` | *(bundled)*            | Override the `/tracker.js` bundle path. Rarely needed.         |
| `RRKIT_VERSION`      | build-time value       | Reported version string.                                       |

> There is **no JWT secret to set.** rrkit generates one on first boot and stores it in the database, so dashboard sessions survive restarts with no configuration. See [`.env.example`](.env.example).

---

## Backups

- **Metadata + settings:** the single file `./data/rrkit.db` (copy it while the container is stopped, or use SQLite's online backup).
- **Recordings:** live in your S3 bucket; back it up with your provider's tooling.

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

## Troubleshooting

| Symptom | Likely cause & fix |
| ------- | ------------------ |
| **Logged out immediately after entering the password.** | Scheme mismatch: rrkit set the cookie `Secure` but the browser isn't on HTTPS (or vice-versa). Terminate TLS at your proxy, serve the dashboard over HTTPS, and forward `X-Forwarded-Proto` matching the browser's scheme. |
| **Tracker isn't recording / no sessions appear.** | Check the `key` and `host` in the snippet; confirm the rrkit host is HTTPS (mixed content is blocked on HTTPS sites); if the site has a CSP, allow the rrkit host in `script-src`/`connect-src`. |
| **`413 Payload Too Large` on ingest.** | Raise the proxy's max body size to ~10 MB (rrkit accepts up to an 8 MB batch). |
| **Client IPs all show as the proxy's address.** | Forward `X-Forwarded-For`; rrkit already runs with `trustProxy` enabled. |
| **S3 "test connection" fails.** | Verify endpoint/region/credentials; enable **path-style** for non-AWS providers (MinIO, some R2/B2 setups). |

---

## Roadmap

rrkit's direction (granular capture controls, network body capture with redaction, retention that syncs to S3 lifecycle rules, privacy/consent tooling, and more) is tracked in [ROADMAP.md](ROADMAP.md). Contributions and ideas welcome.

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

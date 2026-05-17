# Deploying Stacked

Stacked is two pieces, each can run independently:

1. **The SPA** — a Vite-built bundle of static files. Serve from any static
   host (or from PocketBase itself, see below).
2. **PocketBase** — a single Go binary that handles auth + SQLite +
   admin UI. Optional: skip it to ship a pure-localStorage build.

The recommended deploy layout: **one machine, both processes**. No
Docker. No container orchestration. One binary on a configurable port,
plus a static-file directory that the same binary can serve.

---

## 1 · Local end-to-end smoke test

Before deploying anywhere, run the whole thing on your laptop:

```sh
# Terminal 1 — PocketBase (port 8090)
npm run pb:setup       # one-off, downloads the binary
npm run pb:start       # serves http://127.0.0.1:8090

# Terminal 2 — SPA dev server (port 5173)
cp .env.example .env.local   # one-off
npm run dev            # serves http://localhost:5173
```

Open <http://localhost:5173/>. Sign up, save a project, see it sync to
PB at <http://127.0.0.1:8090/_/> (Collections → projects).

Detailed PocketBase setup: [`docs/POCKETBASE_SETUP.md`](POCKETBASE_SETUP.md).

---

## 2 · Single-machine production deploy

The simplest production layout: one VPS (DigitalOcean / Linode / Hetzner
/ a Pi / your old laptop) runs **one** binary that serves the SPA's
static files AND the PocketBase API on the same port.

### 2a · Build the SPA

```sh
npm ci
npm run build           # → dist/
```

`dist/` is fully self-contained — copy it to the deployment machine. Set
the env var that points at PocketBase **at build time**:

```sh
VITE_PB_URL=https://pb.example.com npm run build
```

If you're serving SPA + PB from the same origin (no CORS) you can use a
relative URL:

```sh
VITE_PB_URL=/ npm run build      # use the same origin's /api/...
```

### 2b · Copy the artifacts to the deployment machine

```sh
# locally
rsync -a dist/                  user@host:/srv/stacked/dist/
rsync -a pocketbase/pocketbase  user@host:/srv/stacked/pocketbase
rsync -a pocketbase/pb_migrations/  user@host:/srv/stacked/pb_migrations/
```

On the target machine:

```sh
mkdir -p /srv/stacked/pb_data
cd /srv/stacked
chmod +x pocketbase
```

### 2c · Run PocketBase as the only server

PocketBase has a built-in static file server with the `--publicDir` flag
that serves any folder under the API. So both the SPA and the API come
out of one binary, on one port — **no port conflicts possible**.

```sh
cd /srv/stacked
./pocketbase serve \
  --http=0.0.0.0:8090 \
  --publicDir=./dist \
  --dir=./pb_data \
  --migrationsDir=./pb_migrations
```

Now the host serves:

- `http://<host>:8090/`             → the SPA (`dist/index.html`)
- `http://<host>:8090/api/...`      → PocketBase REST API
- `http://<host>:8090/_/`           → PB admin UI

Build the SPA with `VITE_PB_URL=/` (or the public origin) and the
frontend talks to the same origin's `/api`. **No CORS config needed**
because everything is one origin.

### 2d · Pick a different port to avoid conflicts

The `--http=` flag is the only thing to change. Choose any free port:

```sh
./pocketbase serve --http=0.0.0.0:18090 ...
```

If you're behind a reverse proxy that already binds 80/443, point the
proxy at this port. If you're not, you can use 80 directly (needs
`cap_net_bind` on Linux for non-root) but 8090 / 18090 is fine for most
internal deployments.

### 2e · Run it as a service

**systemd** (Linux):

```ini
# /etc/systemd/system/stacked.service
[Unit]
Description=Stacked (PocketBase + SPA)
After=network.target

[Service]
Type=simple
User=stacked
WorkingDirectory=/srv/stacked
ExecStart=/srv/stacked/pocketbase serve \
  --http=0.0.0.0:8090 \
  --publicDir=/srv/stacked/dist \
  --dir=/srv/stacked/pb_data \
  --migrationsDir=/srv/stacked/pb_migrations
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now stacked
sudo systemctl status stacked
```

**launchd** (macOS, e.g. running on your own Mac as the "deployment
machine"):

```xml
<!-- ~/Library/LaunchAgents/com.stacked.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.stacked</string>
  <key>WorkingDirectory</key><string>/Users/you/stacked</string>
  <key>ProgramArguments</key><array>
    <string>/Users/you/stacked/pocketbase</string>
    <string>serve</string>
    <string>--http=127.0.0.1:8090</string>
    <string>--publicDir=/Users/you/stacked/dist</string>
    <string>--dir=/Users/you/stacked/pb_data</string>
    <string>--migrationsDir=/Users/you/stacked/pb_migrations</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/stacked.log</string>
  <key>StandardErrorPath</key><string>/tmp/stacked.err</string>
</dict></plist>
```

```sh
launchctl load ~/Library/LaunchAgents/com.stacked.plist
launchctl start com.stacked
```

### 2f · TLS (optional)

If you've got a domain, put **Caddy** in front — its single-binary auto-
TLS is the obvious match for the PocketBase ethos:

```Caddyfile
# /etc/caddy/Caddyfile
stacked.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

That's it — Caddy provisions Let's Encrypt automatically. Rebuild the
SPA with `VITE_PB_URL=https://stacked.example.com` (or just `/` if
serving same-origin) and you're done.

---

## 3 · Verify the deploy

A quick checklist on the running production host:

- [ ] `curl http://<host>:<port>/` returns the SPA HTML.
- [ ] `curl http://<host>:<port>/api/health` returns
  `{"code":200,"message":"API is healthy."}`.
- [ ] Loading the URL in a browser shows the Stacked login screen.
- [ ] Sign up via the UI — the new user appears in the PB admin UI.
- [ ] Save a project, refresh, the project is still there.
- [ ] Promote yourself to admin (PB admin UI → Collections → users → set
  `role=admin`). The `⚙ ADMIN` button appears on the home page.

---

## 4 · Backup

Two things to back up:

- `pb_data/` — the SQLite DB and uploaded files. Snapshot regularly.
- `pb_migrations/` — version-controlled in this repo; restore from
  git.

A one-liner cron for the DB:

```sh
0 4 * * *  cp /srv/stacked/pb_data/data.db /backups/stacked-$(date +\%F).db
```

PocketBase uses a WAL-mode SQLite file; copying while the server runs is
safe but you'll get a slightly-stale snapshot. For a fully consistent
dump, run `pocketbase admin backup` (built-in command) or pause the
service briefly.

---

## 5 · Splitting SPA + PocketBase across hosts (only if you must)

If you don't want one binary serving both, run them separately:

- Static host (GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3, …):
  serves `dist/` only. Build with `VITE_PB_URL=https://pb.example.com`.
- PocketBase host: runs the binary, only API/admin. Configure CORS at
  startup with `--origins=https://stacked.example.com`.

This is more moving pieces (DNS, two hosts, CORS) and the only good
reason to do it is if you've already got Pages set up and don't want a
VPS. The single-host layout in §2 is almost always simpler.

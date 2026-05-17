# PocketBase setup

Stacked uses **[PocketBase](https://pocketbase.io)** as its backend when
multi-user auth + project sync is enabled. PocketBase is a single Go binary
that bundles SQLite + auth + an admin UI. No Docker, no separate database,
no services to wire — one process, one port, one directory.

Without PocketBase the app runs in pure-localStorage mode (no login, no
sync, no admin). The setup below is opt-in.

---

## 1 · Install the binary

From the repo root:

```sh
npm run pb:setup
```

This downloads the right PocketBase build for your host (Darwin arm64,
Darwin amd64, Linux x86_64, Linux arm64) into `pocketbase/pocketbase`.
The binary, the SQLite DB it generates, and a few stray release files are
gitignored — only the JS migrations live in version control.

If your platform isn't covered, grab a build manually from
<https://github.com/pocketbase/pocketbase/releases> and drop it at
`pocketbase/pocketbase`.

## 2 · Start it

```sh
npm run pb:start
```

PocketBase starts on **http://127.0.0.1:8090** and serves three things:

- **Admin UI** at `/_/`
- **REST API** at `/api/`
- **Realtime** WebSocket at `/api/realtime`

On first launch, the JS migrations in `pocketbase/pb_migrations/` apply
automatically: the `users` collection gets a `role` field
(`user`/`admin`) and a `projects` collection is created with the right
list / view / create / update / delete rules.

The port is fully configurable. The npm script binds to `127.0.0.1:8090`
which won't conflict with most local services (Vite is on `5173`,
Postgres on `5432`, Redis on `6379`). To use a different port, run the
binary directly:

```sh
cd pocketbase
./pocketbase serve --http=127.0.0.1:9000
```

## 3 · Create the PocketBase admin account

Open <http://127.0.0.1:8090/_/> in a browser. PocketBase asks you to
create the **admin user** (a different concept from app users — this is
the dashboard root account). Use any email + password; this account
never appears in the application UI.

## 4 · Tell the frontend where PB lives

Copy `.env.example` to `.env.local`:

```sh
cp .env.example .env.local
```

The default value already points at `http://127.0.0.1:8090`, which is
what `npm run pb:start` listens on. Leave it as-is for local dev.

Restart `npm run dev` so Vite picks the new env var up.

## 5 · Create your first app user

In the running app at http://localhost:5173 you'll now see a login
screen. Click **Create one →** at the bottom, pick an email + password
(8+ chars), and submit. Behind the scenes Stacked calls PocketBase's
`/api/collections/users/records` endpoint — you can see the new row in
the PB admin UI under **Collections → users**.

## 6 · Promote yourself to admin

Two ways:

**Via the PocketBase admin UI** (easiest):

1. Go to <http://127.0.0.1:8090/_/>.
2. **Collections → users → edit your row → set `role` to `admin`**.

**Via the PocketBase CLI** (scriptable):

```sh
cd pocketbase
./pocketbase admin upsert "<your-app-email>" "<some-password>"   # admin account
# Then update the user record's role with the admin API or via the UI.
```

Reload Stacked — the home page now shows a `⚙ ADMIN` button which opens
the cross-user project browser.

## 7 · Move it to another machine

PocketBase is a single binary plus a `pb_data/` directory (SQLite DB +
attachments). To move installs:

1. Stop the running PocketBase.
2. Copy `pocketbase/pocketbase` + `pocketbase/pb_data/` +
   `pocketbase/pb_migrations/` to the target machine.
3. Run `./pocketbase serve --http=0.0.0.0:8090` (use `0.0.0.0` instead of
   `127.0.0.1` to listen on all interfaces).
4. Update the frontend `.env.local` `VITE_PB_URL` to point at the new
   address.

For production you'll usually want PocketBase fronted by a reverse proxy
(Caddy, Nginx) that terminates TLS, and a service manager (systemd,
launchd) that restarts it. See `docs/DEPLOY.md` for one concrete recipe.

## Resetting

To wipe local state and start fresh:

```sh
rm -rf pocketbase/pb_data
npm run pb:start
```

The migrations re-apply on next startup. The schema is re-created. All
users / projects are gone.

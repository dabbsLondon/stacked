# Deploying Stacked

Two pieces:

1. **Static hosting** for the SPA — GitHub Pages by default (zero-cost, no
   account beyond GitHub). Cloudflare Pages / Netlify / Vercel all work
   identically; switch the workflow if you prefer one of those.
2. **Supabase project** (optional) — only needed if you want sign-in, multi-
   device sync and the admin view. Skip step 2 to ship a pure-localStorage
   version.

The two are independent. You can deploy the SPA first, confirm it works
without Supabase, then come back and wire Supabase whenever you're ready.

---

## 1 · Deploy the SPA to GitHub Pages

The workflow at [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
builds the production bundle and pushes it to GitHub Pages on every push to
`main`. Final URL:

```
https://<your-github-username>.github.io/<repo-name>/
```

For the existing repo that's
**https://dabbslondon.github.io/stacked/**.

### One-time setup (in the GitHub web UI)

1. Open the repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's it — Pages is now driven by the workflow.

### Trigger a deploy

Either push a commit to `main`, or open **Actions → Deploy → Run workflow**
to trigger one manually. The workflow:

- Installs deps + builds (`npm ci && npm run build`).
- Injects `BASE_PATH=/<repo-name>/` so Vite's asset URLs resolve.
- Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from repo secrets
  (optional — without them the site runs in pure-localStorage mode).
- Copies `dist/index.html` to `dist/404.html` so deep links and the magic-
  link redirect resolve client-side instead of hitting Pages' 404.
- Uploads the `dist/` folder as a Pages artifact and deploys it.

You can watch the run live on the Actions tab. When it goes green, hit the
URL above.

### Custom domain (optional)

Add a `CNAME` file to the repo root with your domain (or use the Pages
settings page). Update the Supabase **Site URL** (see §2) to match.

---

## 2 · Provision Supabase (for accounts + admin)

Skip this section if you only want the offline / localStorage build.

### 2a · Create the project

1. Go to <https://app.supabase.com/> → **New project**.
2. Pick a region close to you. Generate and save the Postgres password.
3. Wait for the project to come up (~1 minute).
4. **Project Settings → API**:
   - Copy the **Project URL**.
   - Copy the **anon public** API key.
   - These two values are what the SPA needs.

### 2b · Apply the schema

In the Supabase dashboard, **SQL Editor → New query** and paste the contents
of [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
Click **Run**.

This creates:

- `profiles` (id, display_name, role) — one row per signed-in user.
- `projects` (id, owner_id, name, snapshot jsonb, timestamps).
- A trigger that auto-creates a profile when a new user signs up.
- Row-level security policies so users only see their own projects, and
  `role='admin'` users can additionally read everyone's projects.

Verify in **Table Editor** that both `profiles` and `projects` now exist.

### 2c · Configure the auth provider

The app uses **magic links** (email-only sign-in). Default Supabase auth
already supports this, so the only required step is the redirect URL:

1. **Authentication → URL Configuration**.
2. Set **Site URL** to your deployed URL (e.g.
   `https://dabbslondon.github.io/stacked/`).
3. Under **Redirect URLs**, add the same value plus `http://localhost:5173`
   for local dev. Save.

When a user clicks their magic link they'll be sent back to that URL with
the auth tokens in the hash; the SPA reads them and signs them in.

### 2d · Wire the keys into the build

Two secrets in GitHub:

1. Repo → **Settings → Secrets and variables → Actions → New repository
   secret**.
2. Add **`VITE_SUPABASE_URL`** with the value from §2a.
3. Add **`VITE_SUPABASE_ANON_KEY`** with the value from §2a.

Re-run the **Deploy** workflow (or push any commit). The next build picks
the secrets up and the deployed site gets a login screen.

For local dev:

```sh
cp .env.example .env.local
# edit .env.local with the same two values
npm run dev
```

### 2e · Promote yourself to admin

Sign up via the live site once (magic link) so a `profiles` row exists for
you. Then back in **SQL Editor**:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Reload the site. The home page now has a **⚙ ADMIN** button that opens
the cross-user project / slice browser.

---

## 3 · Verify the deploy

A quick checklist:

- [ ] `https://<your-username>.github.io/<repo>/` loads without console
  errors. Empty home page = expected on first visit.
- [ ] Without Supabase secrets: home page shows `v0.2 · client-side · no
  signup`, no login screen.
- [ ] With Supabase secrets: page shows the Login screen with a magic-link
  field instead.
- [ ] Magic-link email arrives. Clicking it lands you back on the deployed
  URL signed in.
- [ ] Create a project → save → it appears in **Supabase → Table Editor →
  projects**.
- [ ] After running the admin promotion SQL: signed-in admin sees an
  **⚙ ADMIN** button on the home page.

---

## 4 · Updating the deployment

The deploy workflow runs on every push to `main`. CI (`ci.yml`) runs in
parallel and gates nothing — failing tests don't block the deploy. If you
want stricter behaviour, change `deploy.yml` to `needs: ci`.

To deploy a specific commit / branch manually: Actions → Deploy → Run
workflow → pick the ref.

---

## 5 · Alternative hosts

If you'd rather not use GitHub Pages, swap the `deploy.yml` workflow for:

- **Cloudflare Pages** — connect the repo at <https://dash.cloudflare.com/>;
  set build command `npm run build`, output `dist`, env vars
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. No `BASE_PATH` needed —
  CF Pages serves at the root.
- **Netlify** — same idea via `netlify deploy --build`.
- **Vercel** — same idea via `vercel deploy`.

In all three the `BASE_PATH` env var should be unset (defaults to `/`).
Update the Supabase **Site URL** to your new host before sign-in works.

# Supabase setup

Stacked is still browser-only for the storage layer, but as of v0.2 it can
**optionally** sign you in and sync your projects to Supabase so multiple
devices and the admin role both work. If you don't configure Supabase the
app stays exactly as it was — localStorage only.

## 1. Create a Supabase project

1. Go to <https://app.supabase.com/> → **New project**.
2. Pick a region close to you. Postgres password — generate and save it.
3. While the project is provisioning grab the **Project URL** and the
   **anon public** API key from **Project Settings → API**. You'll paste
   them into the app's env file in step 4.

## 2. Apply the schema

In the Supabase dashboard, open **SQL Editor → New query** and paste the
contents of [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
Hit **Run**. You should see no errors and two tables under
**Table Editor**: `profiles` and `projects`.

This creates:

- `profiles` (id, display_name, role) — one row per auth user, role is
  `user` by default
- `projects` (id, owner_id, name, snapshot jsonb, timestamps)
- Row-level security so each user only sees their own projects, and any
  user with `role='admin'` can additionally read all projects
- A trigger that auto-creates a profile row when someone signs up

## 3. Promote yourself to admin

After you sign up to the app at least once, run this in the SQL editor:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOU@example.com');
```

Replace the email with your own. You can repeat this for every account that
should be an admin.

## 4. Wire the keys into the app

Create a `.env.local` file at the repo root (it's already in `.gitignore`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Restart `npm run dev`. When the keys are missing the app falls back to
local-only mode (no login screen, behaves exactly like before). When the
keys are present the home page gets a login flow and projects sync to
Supabase.

## 5. (Optional) Configure email auth

The default auth flow in this app is **magic links** — you type your email,
get a one-time-use link, and you're signed in. To make this work nicely:

1. In Supabase, **Authentication → Providers → Email**, leave **Enable Email
   provider** on.
2. **Authentication → URL Configuration**: set the **Site URL** to your
   deployed URL (e.g. `https://stacked.example.com`) so magic-link redirects
   land in the right place. For local dev, `http://localhost:5173` is fine.
3. (Optional) **Authentication → Email Templates → Magic Link** — customise
   the email body.

If you'd rather use OAuth (Google, GitHub, etc.), enable the provider in the
same screen and the existing login screen will pick it up automatically.

## 6. (Optional) Configure storage size

The default `projects.snapshot` jsonb column holds full GPX point arrays.
A typical project (~10 climbs × 1000 points) lands around 500 KB. Postgres
handles that fine but the free tier has a 500 MB DB cap — so this is good
for ~1000 projects. If you outgrow that, the easiest move is to split GPX
point arrays into a Supabase Storage bucket and store only references in
the snapshot.

## Local development without Supabase

Everything still works without `.env.local`:

- No login screen
- Projects save to `localStorage` only
- Admin view is hidden

This is the recommended state for solo offline use.

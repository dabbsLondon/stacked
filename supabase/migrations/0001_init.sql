-- Stacked — initial schema (profiles + projects)
--
-- Apply via the Supabase SQL editor or `supabase db push` if using the CLI.
-- Idempotent: re-running on a clean DB produces the same state; running on an
-- existing DB will error on duplicate objects (which is the right behaviour
-- before a real migration framework is in place).

-- ============================================================================
-- profiles
-- ============================================================================
-- One row per signed-in user. Mirrors auth.users.id so we can hang an app
-- role + display name off the auth identity.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'App profile for each authenticated user. role=''admin'' grants cross-user read.';

-- Auto-create a profile row when a new auth user is provisioned.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- projects
-- ============================================================================
-- One row per saved Stacked project. The snapshot column holds the full
-- ProjectSnapshot JSON the client already serialises to localStorage today —
-- so the client-side schema migration code keeps working unchanged.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_idx     on public.projects (owner_id);
create index if not exists projects_updated_idx   on public.projects (updated_at desc);

comment on table public.projects is
  'Saved Stacked projects. snapshot mirrors the client''s ProjectSnapshot shape.';

-- ============================================================================
-- helper: is the caller an admin?
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

-- profiles: any authed user can read all profiles (so an admin can resolve a
-- project's owner name without an extra service-role call). Each user can
-- only update their own row.
drop policy if exists profiles_read_all   on public.profiles;
drop policy if exists profiles_self_write on public.profiles;
create policy profiles_read_all on public.profiles
  for select using (auth.role() = 'authenticated');
create policy profiles_self_write on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- projects:
--   * users can CRUD their own projects
--   * admins can additionally read all projects (no write)
drop policy if exists projects_owner_all on public.projects;
drop policy if exists projects_admin_read on public.projects;
create policy projects_owner_all on public.projects
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy projects_admin_read on public.projects
  for select using (public.is_admin());

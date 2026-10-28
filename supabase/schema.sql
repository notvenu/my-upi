-- MyUPI: run once in Supabase → SQL Editor.

-- Every person, payment, split, autopay… as one row per user. The app keeps a full copy on each device
-- and syncs only changed rows; deletes are kept as deleted=true so other devices learn about them.
create table if not exists public.rows (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  id bigint not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists rows_user_updated on public.rows (user_id, updated_at);
alter table public.rows enable row level security;
drop policy if exists "own rows" on public.rows;
create policy "own rows" on public.rows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- server time on every write: devices read "what changed since" by this, whatever their clocks say
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = clock_timestamp(); return new; end $$;
drop trigger if exists rows_touch on public.rows;
create trigger rows_touch before insert or update on public.rows for each row execute function public.touch();

-- live updates between your phone and laptop
alter publication supabase_realtime add table public.rows;

-- Split links: a snapshot per link. Only the owner writes; anyone with the link's id can read that one
-- snapshot through get_share (there's no way to list them).
create table if not exists public.shares (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.shares enable row level security;
drop policy if exists "own shares" on public.shares;
create policy "own shares" on public.shares for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_share(share_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from public.shares where id = share_id
$$;
revoke all on function public.get_share(uuid) from public;
grant execute on function public.get_share(uuid) to anon, authenticated;

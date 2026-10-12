-- Each signed-in user owns one workspace. The RPC serializes writes and rejects stale clients.
create table if not exists public.easier_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.easier_workspaces enable row level security;
create policy "Read own workspace" on public.easier_workspaces for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.easier_workspaces from anon, authenticated;
grant select on public.easier_workspaces to authenticated;

create table if not exists public.easier_workspace_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  payload jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table public.easier_workspace_history enable row level security;
create policy "Read own history" on public.easier_workspace_history for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.easier_workspace_history from anon, authenticated;
grant select on public.easier_workspace_history to authenticated;

create or replace function public.save_easier_workspace(expected_revision bigint, next_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if next_payload->>'format' is distinct from 'easier-cloud-v1' or jsonb_typeof(next_payload->'values') is distinct from 'object' or jsonb_typeof(next_payload->'documents') is distinct from 'array' then
    raise exception 'Invalid workspace';
  end if;
  if pg_column_size(next_payload) > 15000000 then raise exception 'Workspace exceeds 15 MB'; end if;
  -- Transaction-scoped lock also protects first-write races when no row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select revision into current_revision from public.easier_workspaces where user_id = owner_id for update;
  current_revision := coalesce(current_revision, 0);
  if current_revision <> expected_revision then raise exception 'SYNC_CONFLICT' using errcode = 'PT409'; end if;
  insert into public.easier_workspace_history(user_id, revision, payload)
    select user_id, revision, payload from public.easier_workspaces where user_id = owner_id;
  delete from public.easier_workspace_history where user_id = owner_id and revision < current_revision - 29;
  insert into public.easier_workspaces(user_id, revision, payload) values(owner_id, current_revision + 1, next_payload)
  on conflict (user_id) do update set revision = excluded.revision, payload = excluded.payload, updated_at = now();
  return current_revision + 1;
end;
$$;
revoke all on function public.save_easier_workspace(bigint, jsonb) from public, anon;
grant execute on function public.save_easier_workspace(bigint, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('easier-private', 'easier-private', false, 26214400)
on conflict (id) do nothing;
create policy "Read own Easier files" on storage.objects for select to authenticated
using (bucket_id = 'easier-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload immutable Easier files" on storage.objects for insert to authenticated
with check (bucket_id = 'easier-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No public reads, overwrite or delete policies: existing files remain recoverable.

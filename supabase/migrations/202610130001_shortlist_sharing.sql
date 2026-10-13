-- Only explicitly provisioned owners may edit. Existing workspaces retain their owners.
create table public.easier_workspace_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.easier_workspace_owners enable row level security;
revoke all on public.easier_workspace_owners from anon, authenticated;
insert into public.easier_workspace_owners(user_id) select user_id from public.easier_workspaces on conflict do nothing;

create function public.easier_can_edit_workspace() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.easier_workspace_owners where user_id = (select auth.uid()));
$$;
revoke all on function public.easier_can_edit_workspace() from public, anon;
grant execute on function public.easier_can_edit_workspace() to authenticated;

create table public.easier_shortlist_shares (
  user_id uuid primary key references public.easier_workspace_owners(user_id) on delete cascade,
  token text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled boolean not null default false,
  require_login boolean not null default false,
  payload jsonb not null,
  published_at timestamptz not null default now()
);
alter table public.easier_shortlist_shares enable row level security;
revoke all on public.easier_shortlist_shares from anon, authenticated;
grant select(user_id,token,enabled,require_login,published_at) on public.easier_shortlist_shares to authenticated;
create policy "Owner reads sharing settings" on public.easier_shortlist_shares for select to authenticated using (user_id = (select auth.uid()));

-- Strip unknown keys at the database boundary, as well as in the client projection.
create function public.sanitize_easier_shortlist(input jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare p jsonb; item jsonb; programs jsonb := '[]'; facts jsonb; k text; fact jsonb;
begin
  if input->>'version' is distinct from '1' or jsonb_typeof(input->'programs') is distinct from 'array' then
    raise exception 'Invalid shared shortlist';
  end if;
  if pg_column_size(input) > 2000000 or jsonb_array_length(input->'programs') > 1000 then raise exception 'Shared shortlist too large'; end if;
  for p in select value from jsonb_array_elements(input->'programs') loop
    if p->>'category' is null or p->>'category' not in ('彩票','衝刺','主申','較為保險') then continue; end if;
    item := '{}';
    foreach k in array array['id','university','programName','degree','category','campus','delivery','deadline','deadlineStatus','deadlineSource','website','applicationUrl','areas','verified'] loop
      if jsonb_typeof(p->k) = 'string' then item := item || jsonb_build_object(k, p->>k); else item := item || jsonb_build_object(k, ''); end if;
    end loop;
    facts := '{}';
    foreach k in array array['gre','toefl','toeflNew','ielts','duolingo','englishNotes','recommendations','materials','gpa','applicationFee','feeWaiver','tuition','costYear','fees','living','funding'] loop
      fact := p->'requirements'->k;
      if jsonb_typeof(fact->'value') in ('string','number') then
        facts := facts || jsonb_build_object(k, jsonb_build_object('value', fact->'value', 'scope', case when jsonb_typeof(fact->'scope') = 'string' then fact->>'scope' else '' end,
          'sources', case when jsonb_typeof(fact->'sources') = 'array' then (select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(fact->'sources') where jsonb_typeof(value) = 'string' and value #>> '{}' ~ '^https?://') else '[]'::jsonb end));
      end if;
    end loop;
    programs := programs || jsonb_build_array(item || jsonb_build_object('requirements', facts));
  end loop;
  return jsonb_build_object('version', 1, 'cycle', left(coalesce(input->>'cycle',''),80), 'programs', programs);
end;
$$;
revoke all on function public.sanitize_easier_shortlist(jsonb) from public, anon, authenticated;

create function public.configure_easier_share(share_enabled boolean, login_required boolean, next_shortlist jsonb, rotate_token boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result public.easier_shortlist_shares;
begin
  if not public.easier_can_edit_workspace() then raise exception 'Owner access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if share_enabled and next_shortlist is null then raise exception 'Shortlist required'; end if;
  insert into public.easier_shortlist_shares(user_id, enabled, require_login, payload)
    values(owner_id,share_enabled,login_required,public.sanitize_easier_shortlist(coalesce(next_shortlist,'{"version":1,"programs":[]}'::jsonb)))
  on conflict(user_id) do update set enabled = excluded.enabled, require_login = excluded.require_login,
    payload = case when share_enabled then excluded.payload else public.easier_shortlist_shares.payload end,
    token = case when rotate_token then encode(extensions.gen_random_bytes(24),'hex') else public.easier_shortlist_shares.token end,
    published_at = case when share_enabled then now() else public.easier_shortlist_shares.published_at end
  returning * into result;
  return jsonb_build_object('token',result.token,'enabled',result.enabled,'require_login',result.require_login,'published_at',result.published_at);
end;
$$;
revoke all on function public.configure_easier_share(boolean,boolean,jsonb,boolean) from public, anon;
grant execute on function public.configure_easier_share(boolean,boolean,jsonb,boolean) to authenticated;

create function public.read_easier_share(share_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare shared public.easier_shortlist_shares;
begin
  if share_token !~ '^[a-f0-9]{48}$' then return jsonb_build_object('status','not_found'); end if;
  select * into shared from public.easier_shortlist_shares where token = share_token and enabled;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if shared.require_login and auth.uid() is null then return jsonb_build_object('status','login_required'); end if;
  return jsonb_build_object('status','ok','shortlist',shared.payload,'published_at',shared.published_at);
end;
$$;
revoke all on function public.read_easier_share(text) from public;
grant execute on function public.read_easier_share(text) to anon, authenticated;

create or replace function public.save_easier_workspace(expected_revision bigint, next_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_revision bigint;
begin
  if not public.easier_can_edit_workspace() then raise exception 'Owner access required' using errcode = '42501'; end if;
  if next_payload->>'format' is distinct from 'easier-cloud-v1' or jsonb_typeof(next_payload->'values') is distinct from 'object' or jsonb_typeof(next_payload->'documents') is distinct from 'array' then raise exception 'Invalid workspace'; end if;
  if pg_column_size(next_payload) > 15000000 then raise exception 'Workspace exceeds 15 MB'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select revision into current_revision from public.easier_workspaces where user_id = owner_id for update;
  current_revision := coalesce(current_revision, 0);
  if current_revision <> expected_revision then raise exception 'SYNC_CONFLICT' using errcode = 'PT409'; end if;
  insert into public.easier_workspace_history(user_id, revision, payload) select user_id, revision, payload from public.easier_workspaces where user_id = owner_id;
  delete from public.easier_workspace_history where user_id = owner_id and revision < current_revision - 29;
  insert into public.easier_workspaces(user_id, revision, payload) values(owner_id, current_revision + 1, next_payload)
    on conflict (user_id) do update set revision = excluded.revision, payload = excluded.payload, updated_at = now();
  if next_payload->'shortlist' is not null then
    update public.easier_shortlist_shares set payload = public.sanitize_easier_shortlist(next_payload->'shortlist'), published_at = now() where user_id = owner_id and enabled;
  end if;
  return current_revision + 1;
end;
$$;

drop policy "Upload immutable Easier files" on storage.objects;
create policy "Upload immutable Easier files" on storage.objects for insert to authenticated
with check (bucket_id = 'easier-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.easier_can_edit_workspace()));

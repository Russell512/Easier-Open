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

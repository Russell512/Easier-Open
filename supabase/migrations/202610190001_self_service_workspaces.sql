-- Every permanent signed-in account can create its own private workspace.
-- This migration grants no access to another account and never copies a seed,
-- workspace payload, history, file, profile, or share from an existing owner.

create or replace function public.easier_is_registered_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.role()) = 'authenticated', false)
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') <> 'true'
    and exists (
      select 1 from auth.users
      where id = (select auth.uid()) and not coalesce(is_anonymous, false)
    );
$$;
revoke all on function public.easier_is_registered_user() from public, anon;
grant execute on function public.easier_is_registered_user() to authenticated;

-- No user_id argument: callers can only provision their own authenticated uid.
-- Existing owners are unchanged and concurrent first logins are idempotent.
create or replace function public.easier_ensure_workspace_access() returns boolean
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if not public.easier_is_registered_user() then
    raise exception 'A permanent signed-in account is required' using errcode = '42501';
  end if;
  insert into public.easier_workspace_owners(user_id) values (owner_id)
    on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.easier_ensure_workspace_access() from public, anon;
grant execute on function public.easier_ensure_workspace_access() to authenticated;

-- Save/share RPCs and immutable-file upload policies already call this function.
-- Keep their per-uid ownership and revision locks; reject anonymous Auth sessions.
create or replace function public.easier_can_edit_workspace() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.easier_is_registered_user()
    and exists (select 1 from public.easier_workspace_owners where user_id = (select auth.uid()));
$$;
revoke all on function public.easier_can_edit_workspace() from public, anon;
grant execute on function public.easier_can_edit_workspace() to authenticated;

-- Anonymous Auth users have the authenticated database role too. Require a
-- permanent account in addition to the original uid/path ownership checks.
alter policy "Read own workspace" on public.easier_workspaces
  using (user_id = (select auth.uid()) and (select public.easier_is_registered_user()));
alter policy "Read own history" on public.easier_workspace_history
  using (user_id = (select auth.uid()) and (select public.easier_is_registered_user()));
alter policy "Owner reads sharing settings" on public.easier_shortlist_shares
  using (user_id = (select auth.uid()) and (select public.easier_is_registered_user()));
alter policy "Read own Easier files" on storage.objects
  using (bucket_id = 'easier-private' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.easier_is_registered_user()));
alter policy "Read own Easier avatar" on storage.objects
  using (bucket_id = 'easier-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.easier_is_registered_user()));
alter policy "Upload own Easier avatar" on storage.objects
  with check (bucket_id = 'easier-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.easier_is_registered_user()));
alter policy "Delete own Easier avatar" on storage.objects
  using (bucket_id = 'easier-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.easier_is_registered_user()));

-- Public links retain their intended behavior. A login-required link requires a
-- permanent login, not merely a temporary anonymous Auth uid.
create or replace function public.read_easier_share(share_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare shared public.easier_shortlist_shares;
begin
  if share_token !~ '^[a-f0-9]{48}$' then return jsonb_build_object('status','not_found'); end if;
  select * into shared from public.easier_shortlist_shares where token = share_token and enabled;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if shared.require_login and not coalesce(public.easier_is_registered_user(), false) then
    return jsonb_build_object('status','login_required');
  end if;
  return jsonb_build_object('status','ok','shortlist',shared.payload,'published_at',shared.published_at);
end;
$$;
revoke all on function public.read_easier_share(text) from public;
grant execute on function public.read_easier_share(text) to anon, authenticated;

drop policy if exists institutes_owner_delete on public.institutes;

create policy institutes_owner_delete
  on public.institutes for delete
  using (owner_user_id = auth.uid() or public.is_admin());

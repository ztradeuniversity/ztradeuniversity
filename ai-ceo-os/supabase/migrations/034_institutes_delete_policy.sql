-- 034_institutes_delete_policy.sql
-- AI CEO OS — Growth Engine: permanent institute delete.
--
-- The founder explicitly requested Edit + permanent Delete for institutes
-- (the prior soft-delete/archive workflow was removed). Migration 032
-- deliberately shipped NO delete policy under the general no-hard-deletes
-- rule; this migration adds one ONLY for institutes, ONLY because the
-- founder asked for it. Owner-scoped so a founder can delete only their own
-- rows. `lead_pipeline`/`client_touches` do not reference institutes, so a
-- delete leaves no dangling FKs.

create policy institutes_owner_delete
  on public.institutes for delete
  using (owner_user_id = auth.uid() or public.is_admin());

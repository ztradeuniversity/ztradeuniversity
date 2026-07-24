-- =============================================================================
-- FREE CLASSES — public content flag for the Premium Library
-- Project: LIBRARY Supabase (System B) — dcgtmiduqxnmfjkimxeh
-- =============================================================================
--
-- REASON
--   The public Free Classes page (free-classes.html) must display ONLY the
--   Library items an admin has explicitly published to it, while keeping the
--   Premium Library and its OTP flow untouched. This is achieved with a single
--   new boolean flag per item — `is_free` — on the two content types Free
--   Classes supports: videos and books. (`is_featured`, used to sort featured
--   items first, ALREADY EXISTS on these tables and is not recreated here.)
--
--   Single source of truth: the existing library_videos / library_books rows.
--   free-classes.html reads `is_free = true` via the public anon key (read-only,
--   same trust model as library.html). Audio is intentionally excluded — it
--   remains premium-only.
--
-- SAFETY
--   Purely additive. DEFAULT false means every existing row stays premium-only
--   until an admin toggles "Publish to Free Classes". No data is modified, no
--   column is dropped, no RLS/policy is changed. Existing Premium Library
--   behaviour is unaffected.
--
-- DO NOT AUTO-EXECUTE — run manually in the Library Supabase SQL editor after
-- review/approval.
-- =============================================================================

-- ── MIGRATION ────────────────────────────────────────────────────────────────
ALTER TABLE public.library_videos
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

ALTER TABLE public.library_books
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

-- Speed up the public page's filtered/sorted read (is_free + featured-first).
CREATE INDEX IF NOT EXISTS idx_library_videos_is_free
  ON public.library_videos (is_free, is_featured DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_library_books_is_free
  ON public.library_books (is_free, is_featured DESC, created_at DESC);


-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Run ONLY to fully undo the migration above.
--
-- DROP INDEX IF EXISTS public.idx_library_videos_is_free;
-- DROP INDEX IF EXISTS public.idx_library_books_is_free;
-- ALTER TABLE public.library_videos DROP COLUMN IF EXISTS is_free;
-- ALTER TABLE public.library_books  DROP COLUMN IF EXISTS is_free;

-- seed-06-region-expansion.sql
-- AI CEO OS — Seed Batch 6: Lahore -> Pakistan region auto-continuation
-- Source: Founder OS Refinement Patch (post-Step-6), Patch 5. RUN ONCE, after
-- seed-04-physical.sql. Rollback at bottom.
-- FOUNDER: confirm the email below matches your admin account.
--
-- WHAT THIS DOES: extends the EXISTING physical.area_queue setting (seeded
-- empty-of-cities in seed-04, 10 Lahore areas only) by appending city-level
-- entries so the 15-day rotation continues automatically once every Lahore
-- area has had its cycle — "After Lahore finishes, automatically continue"
-- (Patch 5), using the SAME rotation engine unchanged (a city name is just
-- another queue entry; physical-logic.js's currentAreaAssignment never
-- needed to change).
--
-- SAFETY GUARD (added — Final Refinement Patch): the UPDATE below only fires
-- if physical.area_queue is STILL byte-for-byte the pristine seed-04 array.
-- If the founder has already reordered, added, or removed areas (via the
-- Growth page's reorder controls or the Playbooks Complete Plan editor, both
-- of which write this same setting), the value will no longer match and
-- this file becomes a safe no-op — it will NEVER overwrite a founder
-- customization. Re-running this file after the founder has edited their
-- queue is therefore always safe: it does nothing.
--
-- ORDER (when it DOES apply): exactly the founder-stated sequence
-- (Faisalabad, Rawalpindi, Islamabad, Multan, Sargodha, Sahiwal,
-- Gujranwala), then the remaining research-verdict cities from seed-04 not
-- yet named (Peshawar, Karachi, Hyderabad — all verdict='trial'). Quetta is
-- DELIBERATELY EXCLUDED: its seeded verdict is 'defer' ("re-check after
-- Karachi wave") — including it in an active auto-continuation queue would
-- contradict the stored research. No area-level research exists yet for any
-- of these cities (that would be NEW research, out of scope) — each city
-- cycles as ONE 15-day unit until the founder later researches and adds its
-- own areas, exactly like a Lahore area does today (now possible directly
-- from the Founder OS UI — Playbooks -> Physical -> Complete Plan -> edit
-- the area list and save; no SQL needed for that going forward).
--
-- THIS IS A DATA UPDATE, NOT A SCHEMA CHANGE — physical.area_queue already
-- exists (seed-04); its jsonb array value is simply extended here.

update public.settings
set value = '["Johar Town","Gulberg","Model Town","Township","Iqbal Town","Wapda Town","DHA","Garhi Shahu","Baghbanpura","Shalimar","Faisalabad","Rawalpindi","Islamabad","Multan","Sargodha","Sahiwal","Gujranwala","Peshawar","Karachi","Hyderabad"]'::jsonb,
    updated_at = now()
where scope = 'global'
  and key = 'physical.area_queue'
  -- Guard: only touch the row if it is EXACTLY the untouched seed-04 array.
  and value = '["Johar Town","Gulberg","Model Town","Township","Iqbal Town","Wapda Town","DHA","Garhi Shahu","Baghbanpura","Shalimar"]'::jsonb;

-- ============================================================
-- VERIFICATION (run after)
-- ============================================================
-- select value, jsonb_array_length(value) as area_count
-- from public.settings where scope='global' and key='physical.area_queue';
--   * If this UPDATE applied: expect a 20-element array (10 Lahore areas +
--     10 city entries, in the order documented above).
--   * If the founder had already customized the queue: expect it UNCHANGED
--     from whatever the founder last saved (this file did nothing — by
--     design, not an error). Check the founder's own order was preserved.

-- ============================================================
-- ROLLBACK (restores the seed-04 value — 10 Lahore areas only; only
-- meaningful if THIS file's update actually applied — see verification)
-- ============================================================
-- update public.settings
-- set value = '["Johar Town","Gulberg","Model Town","Township","Iqbal Town","Wapda Town","DHA","Garhi Shahu","Baghbanpura","Shalimar"]'::jsonb,
--     updated_at = now()
-- where scope = 'global' and key = 'physical.area_queue';

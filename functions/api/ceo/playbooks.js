// functions/api/ceo/playbooks.js  ->  GET /api/ceo/playbooks
//
// Read-only reference feed for the Playbooks page (Founder OS Restructure
// Step 4). Returns the already-seeded execution knowledge grouped by
// category — country/platform/audience playbooks, growth-stage gates, cadence
// templates, lifecycle rules — plus the locked research verdicts, the
// automation registry (for Manual/Automated classification), and the two
// language register rules. Zero writes, zero new tables, zero computation:
// this endpoint surfaces what the seeds already say, so the presentation
// layer never hardcodes a second copy of any verdict (one-home rule).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const KB_CATEGORIES = [
  'country-playbook',
  'platform-playbook',
  'audience-playbook',
  'growth-stage',
  'cadence-template',
  'lifecycle-rule',
  'execution-checklist',
  'area-playbook',
  'sales-template',
  'physical-funnel',
  'marketing-rule',
];

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [kb, research, automation, registers, kpis] = await Promise.all([
      db.select(
        'knowledge_base',
        `select=category,title,content&owner_user_id=eq.${uid}&category=in.(${KB_CATEGORIES.join(',')})&is_active=eq.true&order=category.asc,title.asc`
      ),
      db.select(
        'research_library',
        `select=title,domain,verdict,confidence,evidence_tier,summary,reviewed_at&owner_user_id=eq.${uid}&order=domain.asc,title.asc`
      ),
      db.select(
        'automation_registry',
        'select=key,label,description,module,matrix_class,trigger_type,is_active&order=module.asc,key.asc'
      ),
      db.select(
        'knowledge_base',
        `select=title,content&owner_user_id=eq.${uid}&category=eq.mentor-template&title=in.(register_ur,register_en)`
      ),
      // KPI catalog (admin-managed, no owner) — the Funnel and Founder Tools
      // tabs join stages/tools to their owning KPIs by locked seed key.
      db.select('kpi_definitions', 'select=key,label,category,description&is_active=eq.true&order=category.asc,key.asc'),
    ]);

    // Physical-engine config (city + area queue order) so the Physical tab
    // renders areas in rotation order, not alphabetically.
    const physicalSettings = await db.select('settings', `select=key,value&scope=eq.global&key=in.(physical.city,physical.cycle_days,physical.area_queue)`);
    const phys = (k) => physicalSettings.find((s) => s.key === k)?.value;

    const playbooks = {};
    for (const row of kb) (playbooks[row.category] ||= []).push({ title: row.title, content: row.content });

    return json({
      playbooks,
      research,
      automation,
      registers: Object.fromEntries(registers.map((r) => [r.title, r.content])),
      kpis,
      physical: {
        city: phys('physical.city') ? String(phys('physical.city')).replace(/"/g, '') : null,
        cycleDays: Number(phys('physical.cycle_days') || 15),
        areaQueue: phys('physical.area_queue') || [],
      },
    });
  } catch (err) {
    return json({ error: 'playbooks_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

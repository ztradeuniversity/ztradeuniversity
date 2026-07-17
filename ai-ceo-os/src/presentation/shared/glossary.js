// glossary.js — beginner-friendly meaning for every abbreviation used in the
// AI CEO OS. wireGlossary(root) scans rendered text and wraps each known
// abbreviation with a dotted-underline <abbr>: hover shows the full form +
// one-line explanation, click (or Enter/Space when focused) opens a popover
// with all four fields — Full Form, Simple explanation, Why it is used here,
// and How to interpret it in THIS context.
//
// Self-contained by design: no CSS file changes, no new markup in any page —
// call it after a render and it annotates whatever is on screen.

export const GLOSSARY = {
  IB: {
    full: 'Introducing Broker',
    simple: 'A partner who introduces new traders to a broker and earns a share of the broker\'s commission when those traders trade.',
    why: 'It is this entire business model — ZTU teaches for free and earns when educated students choose to trade through the broker.',
    how: '"Active IB client" = a real person who opened an account through your link AND still trades. The 50,000 target counts these people, not followers.',
  },
  KPI: {
    full: 'Key Performance Indicator',
    simple: 'The one number that tells you whether something actually worked.',
    why: 'Every task here names its KPI so effort is judged by results, not by feeling busy.',
    how: 'If a task\'s KPI is not moving after a few weeks, the task is wrong — change it, do not just try harder.',
  },
  CTA: {
    full: 'Call To Action',
    simple: 'The one thing you ask the audience to do next (for example: "watch the free course").',
    why: 'A post without a clear next step wastes the trust it just earned.',
    how: 'In this system the CTA is almost always the FREE COURSE — never "deposit money". One in three posts asks for nothing at all.',
  },
  CAC: {
    full: 'Customer Acquisition Cost',
    simple: 'How much money you spent on ads to get ONE paying client. Ad spend ÷ clients gained.',
    why: 'It decides whether paid ads are allowed to continue or must be switched off.',
    how: 'Target is under PKR 1,500 per activated client. If CAC rises above the cap, stop the campaign — do not "wait for it to improve".',
  },
  ROI: {
    full: 'Return On Investment',
    simple: 'What you got back compared to what you put in (money or time).',
    why: 'It separates the few activities worth doing from the many that only look productive.',
    how: 'Right now most work is organic, so ROI here mostly means RESULT PER HOUR, not per rupee.',
  },
  LTV: {
    full: 'Lifetime Value',
    simple: 'The total commission one client is likely to generate over the whole relationship.',
    why: 'It explains why retention beats chasing new clients, and why some audiences deserve more of your time.',
    how: '"Highest-LTV segment" (for example GCC professionals) = fewer people, but each one is worth far more long-term.',
  },
  GCC: {
    full: 'Gulf Cooperation Council',
    simple: 'The six Gulf countries: UAE, Saudi Arabia, Qatar, Oman, Kuwait, Bahrain.',
    why: 'Millions of Pakistani expats live there — they understand your Urdu content and have more capital to trade.',
    how: 'GCC needs no separate content: the same Urdu videos, just posted at Gulf evening times and led with the Islamic account option.',
  },
  SOP: {
    full: 'Standard Operating Procedure',
    simple: 'A fixed step-by-step recipe for doing a task the same correct way every time.',
    why: 'So you never have to invent scripts or wonder what "community touch" means today.',
    how: 'Open the SOP and follow it top to bottom — it already contains the questions, message, CTA and mistakes to avoid.',
  },
  CRM: {
    full: 'Customer Relationship Management',
    simple: 'The record of every client and institute — who they are, what stage they are at, and when to contact them next.',
    why: 'Trust does not scale from memory; it scales from a follow-up date written down.',
    how: 'In this OS the CRM is the Growth page (clients) and the Physical tab (institutes). A visit without a logged follow-up date is an incomplete visit.',
  },
  GEO: {
    full: 'Generative Engine Optimization',
    simple: 'Writing articles so that AI assistants (ChatGPT, Gemini, AI search) quote YOU when someone asks a trading question.',
    why: 'AI answers are becoming how beginners search — being the quoted source is free, compounding traffic.',
    how: 'Practically it means: publish the article version of every video, keep it under 90 days fresh, and keep the FAQ structure intact.',
  },
  SEO: {
    full: 'Search Engine Optimization',
    simple: 'Making your pages findable on Google for the questions people actually type.',
    why: 'It turns one video into traffic that keeps arriving for years.',
    how: 'Here it mostly means: title = the real question a beginner would type, in their own words.',
  },
  PKR: {
    full: 'Pakistani Rupee',
    simple: 'Pakistan\'s currency — the unit every budget in this plan is written in.',
    why: 'Budgets are stated in the currency you actually spend, not converted dollars.',
    how: '"PKR 0" means the activity costs time only, not money.',
  },
  'P&L': {
    full: 'Profit and Loss',
    simple: 'What a market or activity earned minus what it cost.',
    why: 'From Year 4 each country is judged on its own P&L, not on gut feeling.',
    how: '"Per-market P&L lines" = keep Pakistan, Nigeria, etc. as separate scorecards so you can scale winners and kill losers.',
  },
  FAQ: {
    full: 'Frequently Asked Questions',
    simple: 'The common questions listed with answers, often marked up so search engines show them directly.',
    why: 'It captures beginners at the exact moment they are confused.',
    how: 'On the website it is a structured block — keep its format when refreshing an article or the search benefit is lost.',
  },
  QC: {
    full: 'Quality Check',
    simple: 'A human reviewing work before it goes public.',
    why: 'Machine-translated content can be embarrassing or wrong in a way only a native speaker catches.',
    how: '"Native QC must pass" = a real Bengali/Arabic speaker approves the trial content before that market opens. No exceptions.',
  },
  CFD: {
    full: 'Contract For Difference',
    simple: 'A contract to trade a price movement without owning the actual asset (you never receive real gold).',
    why: 'It is what your students actually trade, and what makes the halal question a real question.',
    how: 'When teaching gold, be clear: this is paper gold (a CFD), not physical gold in a locker.',
  },
  XAUUSD: {
    full: 'Gold priced in US Dollars',
    simple: 'The trading symbol for gold: XAU means gold, USD means US dollar.',
    why: 'Gold is this brand\'s core specialty and the main content pillar.',
    how: 'When a plan day says "XAUUSD levels", it means today\'s gold support/resistance — analysis for education, never a signal.',
  },
  BTC: {
    full: 'Bitcoin',
    simple: 'The largest cryptocurrency.',
    why: 'It is the secondary content pillar alongside gold.',
    how: 'Treated exactly like gold: educational structure reads, honest risk talk, never predictions.',
  },
  DXY: {
    full: 'US Dollar Index',
    simple: 'A number showing whether the US dollar is strong or weak against other major currencies.',
    why: 'Gold usually moves opposite to the dollar — it explains WHY gold moved today.',
    how: 'Use it to teach cause and effect ("dollar strong, gold pressured"), not to predict tomorrow.',
  },
  FOMO: {
    full: 'Fear Of Missing Out',
    simple: 'Jumping into a trade because you are scared of missing a move, not because your plan said so.',
    why: 'It is one of the founder\'s own tracked trading weaknesses and a top student mistake.',
    how: 'In the trading check-in, an honest "yes I felt FOMO" is more valuable than a clean-looking score.',
  },
  MT4: {
    full: 'MetaTrader 4',
    simple: 'The most common trading platform (software) beginners use.',
    why: 'Students ask "which platform" constantly — it is a proven content topic.',
    how: 'A content topic, not a recommendation to trade — teach how to use it safely.',
  },
  MT5: {
    full: 'MetaTrader 5',
    simple: 'The newer version of the MetaTrader trading platform.',
    why: 'Same as MT4 — a recurring beginner question worth a dedicated lesson.',
    how: 'Teach the difference plainly; do not oversell either one.',
  },
  SBP: {
    full: 'State Bank of Pakistan',
    simple: 'Pakistan\'s central bank — it sets the rules on moving money abroad.',
    why: 'Payment rules affect how your students can fund accounts, so the topic is unavoidable.',
    how: 'Explain the rules honestly and NEVER advise how to get around them. That line is permanent.',
  },
  RBI: {
    full: 'Reserve Bank of India',
    simple: 'India\'s central bank — it is hostile to retail forex IB models.',
    why: 'It is the reason India is excluded from the plan despite a huge Urdu/Hindi audience.',
    how: 'Treat Indian viewers as free organic upside only — spend zero minutes targeting them.',
  },
  FSCA: {
    full: 'Financial Sector Conduct Authority',
    simple: 'South Africa\'s financial regulator.',
    why: 'South Africa is a planned market, and its rules shape what you may say in content.',
    how: 'When SA opens, frame broker content around FSCA regulation — it is a trust asset there, not a burden.',
  },
  MSA: {
    full: 'Modern Standard Arabic',
    simple: 'The formal Arabic understood across all Arab countries, versus local dialects.',
    why: 'If Egypt ever opens, the language choice decides whether content feels native or foreign.',
    how: 'That decision is made INSIDE the trial with a native speaker — not guessed in advance.',
  },
  EN: {
    full: 'English',
    simple: 'The English language.',
    why: 'It is the second engine: Nigeria and Kenya are English-speaking markets.',
    how: '"EN mirrors" = English remakes of videos that ALREADY proved themselves in Urdu — never brand-new experiments.',
  },
  NG: {
    full: 'Nigeria',
    simple: 'West Africa\'s largest economy and a big retail trading market.',
    why: 'It is the first English-language expansion market in this plan.',
    how: 'Enter with proven content only; watch regulation closely.',
  },
  KE: {
    full: 'Kenya',
    simple: 'An East African market with a large mobile-first trading audience.',
    why: 'It pairs with Nigeria as the English engine.',
    how: 'WhatsApp matters more than Telegram here — adjust the channel, not the teaching.',
  },
  PK: {
    full: 'Pakistan',
    simple: 'The home market and first priority.',
    why: 'It is where trust, content and the first clients are built.',
    how: 'Pakistan stays the primary engine even after international markets open.',
  },
  TG: {
    full: 'Telegram',
    simple: 'The messaging app where the community lives.',
    why: 'It is the conversion square — where questions get answered and trust is built daily.',
    how: 'Rule: answer everything within 24 hours; never sell signals in DMs.',
  },
  WA: {
    full: 'WhatsApp',
    simple: 'The messaging app used for personal, one-to-one contact.',
    why: 'It is the inner circle — where retention and IB conversations actually happen.',
    how: 'Voice notes beat text here. Personal, never broadcast.',
  },
  YT: {
    full: 'YouTube',
    simple: 'The video platform.',
    why: 'It is the compounding engine — one video feeds every other channel.',
    how: 'Consistency beats production quality. One imperfect take, every week.',
  },
  FB: {
    full: 'Facebook',
    simple: 'The social platform used for group reposts and (later) paid ads.',
    why: 'It is the discovery skim now, and the only paid channel after the gate opens.',
    how: 'Organic = clip reposts into PK groups. Paid = only after 300 activated clients.',
  },
  IG: {
    full: 'Instagram',
    simple: 'The photo/short-video platform.',
    why: 'It is a repost shelf only — the research says native effort here is not worth it.',
    how: 'If reposting is not literally one click, skip it entirely.',
  },
  HTF: {
    full: 'Higher Time Frame',
    simple: 'Looking at a chart zoomed out (weekly/daily) instead of zoomed in (minutes).',
    why: 'It teaches structure and patience instead of noise-chasing.',
    how: 'Used in weekly BTC/gold structure posts — the big picture first.',
  },
  AI: {
    full: 'Artificial Intelligence',
    simple: 'Software that can analyse patterns and generate suggestions.',
    why: 'This OS uses it to spot your recurring weaknesses and re-weight your plan from your own history.',
    how: 'It never invents your numbers — every AI line here is computed from real rows you produced.',
  },
};

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'ABBR', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'CODE', 'PRE']);
let popoverEl = null;
let regexCache = null;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&'); }

function termRegex() {
  if (!regexCache) {
    const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length).map(escapeRe);
    regexCache = new RegExp(`(?<![A-Za-z0-9])(${terms.join('|')})(?![A-Za-z0-9])`, 'g');
  }
  regexCache.lastIndex = 0;
  return regexCache;
}

// Annotate every known abbreviation inside `root`. Safe to call after each
// render: it only rewrites TEXT nodes (never elements carrying listeners) and
// skips anything already inside an <abbr> or a form control.
export function wireGlossary(root) {
  if (!root) return;
  const re = termRegex();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || SKIP_TAGS.has(p.tagName) || p.closest('abbr')) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      re.lastIndex = 0;
      return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (const node of targets) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(makeAbbr(m[1]));
      last = m.index + m[1].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    if (node.parentNode) node.parentNode.replaceChild(frag, node);
  }
}

function makeAbbr(term) {
  const g = GLOSSARY[term];
  const el = document.createElement('abbr');
  el.textContent = term;
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${term}: ${g.full}. Open full explanation.`);
  el.setAttribute('title', `${g.full} — ${g.simple}\n(click for the full explanation)`);
  el.style.cssText = 'text-decoration: underline dotted; text-underline-offset: 2px; cursor: help; text-decoration-color: var(--ceo-text-muted);';
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showPopover(el, term); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPopover(el, term); }
  });
  return el;
}

function ensurePopover() {
  if (popoverEl) return popoverEl;
  popoverEl = document.createElement('div');
  popoverEl.style.cssText = [
    'position: absolute', 'z-index: 9999', 'max-width: 340px', 'display: none',
    'padding: 12px 14px', 'border-radius: var(--ceo-radius-md, 10px)',
    'border: 1px solid var(--ceo-border, #262b36)',
    'background: var(--ceo-surface-raised, #181c25)',
    'color: var(--ceo-text-primary, #e8e6df)',
    'box-shadow: 0 10px 30px rgba(0,0,0,0.45)',
    'font-size: 0.8rem', 'line-height: 1.5',
  ].join(';');
  document.body.appendChild(popoverEl);
  document.addEventListener('click', (e) => {
    if (popoverEl.style.display !== 'none' && !popoverEl.contains(e.target)) hidePopover();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePopover(); });
  window.addEventListener('scroll', hidePopover, true);
  window.addEventListener('resize', hidePopover);
  return popoverEl;
}

function hidePopover() { if (popoverEl) popoverEl.style.display = 'none'; }

function showPopover(anchor, term) {
  const g = GLOSSARY[term];
  const el = ensurePopover();
  el.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 6px;">${esc(term)} — ${esc(g.full)}</div>
    <div style="margin-bottom: 8px;">${esc(g.simple)}</div>
    <div style="margin-bottom: 8px;"><strong>Why it is used here:</strong> ${esc(g.why)}</div>
    <div style="margin-bottom: 10px;"><strong>How to read it in this context:</strong> ${esc(g.how)}</div>
    <button type="button" class="ceo-btn ceo-btn-secondary" data-glossary-close style="font-size: 0.72rem; padding: 2px 10px;">Close</button>`;
  el.style.display = 'block';
  el.querySelector('[data-glossary-close]').addEventListener('click', hidePopover);

  const r = anchor.getBoundingClientRect();
  const top = r.bottom + window.scrollY + 6;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 12;
  el.style.top = `${top}px`;
  el.style.left = `${Math.max(window.scrollX + 8, Math.min(r.left + window.scrollX, maxLeft))}px`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

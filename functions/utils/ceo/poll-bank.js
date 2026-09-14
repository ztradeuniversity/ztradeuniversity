// functions/utils/ceo/poll-bank.js
//
// Social Engagement Poll Planning — the curated poll library + the
// constrained-randomized scheduler that turns it into a real 5-year plan.
// Mirrors content-ideas.js's own pattern exactly (a static bank + a
// dedupe-safe seed action in growth.js) rather than inventing a second
// scheduling system: polls ARE content_library rows (content_type='poll'),
// so Reset Plan, the kanban's move/edit actions, and the no-hard-deletes
// rule all already apply to them with zero special-casing.
//
// Every question is short (one line), plain, trading-related, answerable in
// seconds, and answer options are neutral/non-leading — see POLL_BANK below.
// `purpose` is the one-sentence audience-insight reason a founder posts it.

// --- Taxonomy (Section 9) --------------------------------------------------
// `key` rides in content_library.pillar (free text, no schema change).
// `weakness` is the plain-language signal a lopsided answer distribution
// points to — read by buildEngagementInsight() below; this is aggregated
// trend intelligence only, never a single-poll business decision (Section 11).
export const POLL_CATEGORIES = [
  { key: 'habits', label: 'Trading Habits', weakness: 'inconsistent routine / overtrading' },
  { key: 'technical', label: 'Technical Analysis', weakness: 'weak charting foundation' },
  { key: 'risk', label: 'Risk Management', weakness: 'no stop loss / oversized risk discipline' },
  { key: 'psychology', label: 'Psychology', weakness: 'emotional control / revenge trading' },
  { key: 'strategy', label: 'Strategy', weakness: 'no consistent strategy / low confidence' },
  { key: 'fundamentals', label: 'Fundamentals', weakness: 'ignoring news/event risk' },
  { key: 'markets', label: 'Gold / BTC / Forex', weakness: 'market-preference signal, not a weakness' },
  { key: 'education', label: 'Education', weakness: 'skill/knowledge gap — content topic demand' },
  { key: 'journaling', label: 'Journaling', weakness: 'no review habit / no journal' },
  { key: 'timing', label: 'Market Timing', weakness: 'poor session/timing awareness' },
  { key: 'community', label: 'Community', weakness: 'engagement/content-preference signal' },
];

// --- The bank (Section 9/10/13) --------------------------------------------
// Short question + 2–5 short, neutral, non-leading options. Human/conversa-
// tional tone (Section 13) — never institutional jargon. `channel` is a
// DEFAULT suggestion only (Section 16 channel strategy); the scheduler still
// varies it, this is just each poll's natural best-fit home.
export const POLL_BANK = [
  // --- Trading Habits ---
  { cat: 'habits', channel: 'WhatsApp', q: "What trading session do you usually trade?", opts: ['Asian', 'London', 'New York', 'Multiple sessions'], purpose: 'Helps us understand when our audience is most active.' },
  { cat: 'habits', channel: 'Telegram', q: "How many trades do you usually take in a day?", opts: ['1', '2-3', '4-6', '7+'], purpose: 'Flags overtrading risk in the community at a glance.' },
  { cat: 'habits', channel: 'Facebook', q: "Do you trade every day or only on setups you like?", opts: ['Every day', 'Only good setups', 'A few days a week'], purpose: 'Shows how disciplined our audience is about entries.' },
  { cat: 'habits', channel: 'WhatsApp', q: "What's the first thing you do when you open your charts?", opts: ['Check news', 'Check levels', 'Check open trades', 'Check my journal'], purpose: 'Reveals the audience\'s actual pre-trade routine.' },
  { cat: 'habits', channel: 'Telegram', q: "Do you trade on weekends (crypto) or only weekdays?", opts: ['Weekdays only', 'Weekends too', 'Rarely trade'], purpose: 'Tells us how much crypto vs forex focus exists.' },
  { cat: 'habits', channel: 'All', q: "How long have you been trading?", opts: ['<6 months', '6-12 months', '1-3 years', '3+ years'], purpose: 'Segments the audience by experience level.' },
  { cat: 'habits', channel: 'WhatsApp', q: "Do you trade with a fixed lot size or change it often?", opts: ['Always fixed', 'Sometimes change', 'Always different'], purpose: 'Signals whether position sizing is disciplined.' },
  { cat: 'habits', channel: 'Facebook', q: "What device do you trade on most?", opts: ['Phone', 'Laptop/PC', 'Both equally'], purpose: 'Helps us design content for the right screen size.' },
  { cat: 'habits', channel: 'Telegram', q: "Do you set a daily trade limit for yourself?", opts: ['Yes, always', 'Sometimes', 'No limit'], purpose: 'Shows how many traders self-regulate overtrading.' },
  { cat: 'habits', channel: 'WhatsApp', q: "How much time do you spend on charts daily?", opts: ['<30 min', '30-60 min', '1-3 hours', '3+ hours'], purpose: 'Helps size how much daily content people can absorb.' },

  // --- Technical Analysis ---
  { cat: 'technical', channel: 'Telegram', q: "Do you prefer technical or fundamental analysis?", opts: ['Technical', 'Fundamental', 'Both equally'], purpose: 'Tells us which content type to prioritize.' },
  { cat: 'technical', channel: 'Telegram', q: "Which indicator do you use most?", opts: ['Moving Average', 'RSI', 'MACD', 'None — price action only'], purpose: 'Shows the most popular tools in our community.' },
  { cat: 'technical', channel: 'WhatsApp', q: "What do you check first before entering a trade?", opts: ['Support/resistance', 'Trend direction', 'An indicator', 'News'], purpose: 'Reveals the real entry process traders actually use.' },
  { cat: 'technical', channel: 'Facebook', q: "Do you draw your own support/resistance levels?", opts: ['Always', 'Sometimes', 'I use auto-indicators', 'Never'], purpose: 'Signals charting-skill level across the group.' },
  { cat: 'technical', channel: 'Telegram', q: "Which timeframe do you trust most for a decision?", opts: ['1-min/5-min', '15-min/1H', '4H', 'Daily'], purpose: 'Helps us match educational content to real habits.' },
  { cat: 'technical', channel: 'WhatsApp', q: "Candlestick patterns — do you actually use them?", opts: ['Yes, daily', 'Sometimes', 'I know them but rarely use', 'Not really'], purpose: 'Shows demand for a candlestick-pattern class.' },
  { cat: 'technical', channel: 'Telegram', q: "Do you trade breakouts or wait for a pullback?", opts: ['Breakout entry', 'Wait for pullback', 'Depends on the setup'], purpose: 'Highlights the community\'s dominant entry style.' },
  { cat: 'technical', channel: 'Facebook', q: "Which chart type do you trade with?", opts: ['Candlesticks', 'Line chart', 'Bar chart', "Don't know the difference"], purpose: 'Flags a basic-education gap if the last option wins.' },

  // --- Risk Management ---
  { cat: 'risk', channel: 'WhatsApp', q: "Do you always use a Stop Loss?", opts: ['Always', 'Usually', 'Sometimes', 'Rarely', 'Never'], purpose: 'Direct read on the community\'s single biggest risk habit.' },
  { cat: 'risk', channel: 'Telegram', q: "What's your biggest risk-management mistake?", opts: ['No stop loss', 'Risking too much per trade', 'Moving my SL further away', 'Ignoring position size'], purpose: 'Names the exact weakness to design a class around.' },
  { cat: 'risk', channel: 'WhatsApp', q: "How much do you risk per trade?", opts: ['<1%', '1-2%', '3-5%', 'More than 5%'], purpose: 'Flags how many traders are risking too much per trade.' },
  { cat: 'risk', channel: 'Telegram', q: "Do you ever move your Stop Loss further away mid-trade?", opts: ['Never', 'Rarely', 'Sometimes', 'Often'], purpose: 'A classic discipline break — shows how common it is.' },
  { cat: 'risk', channel: 'Facebook', q: "Do you use a Take Profit or close trades manually?", opts: ['Always set TP', 'Close manually', 'Mix of both'], purpose: 'Shows how much the audience plans exits in advance.' },
  { cat: 'risk', channel: 'WhatsApp', q: "What % of your account would one bad week cost you?", opts: ['<5%', '5-15%', '15-30%', 'More than 30%'], purpose: 'A blunt gauge of real drawdown exposure.' },
  { cat: 'risk', channel: 'Telegram', q: "Do you risk more after a losing trade to 'win it back'?", opts: ['Never', 'Rarely', 'Sometimes', 'Often'], purpose: 'Directly measures revenge-sizing behavior.' },
  { cat: 'risk', channel: 'WhatsApp', q: "Do you know your risk-reward ratio before you enter?", opts: ['Always', 'Usually', 'Rarely', 'Never think about it'], purpose: 'Checks whether trades are planned or reactive.' },

  // --- Psychology ---
  { cat: 'psychology', channel: 'Telegram', q: "What's your biggest problem after a losing trade?", opts: ['Revenge trading', 'Overthinking', 'Taking another trade too quickly', 'Increasing lot size'], purpose: 'Names the exact post-loss pattern to address in coaching.' },
  { cat: 'psychology', channel: 'WhatsApp', q: "Do you ever revenge trade?", opts: ['Never', 'Rarely', 'Sometimes', 'Often'], purpose: 'A direct, honest gauge of the community\'s biggest leak.' },
  { cat: 'psychology', channel: 'Telegram', q: "What causes you to close a winning trade too early?", opts: ['Fear it will reverse', 'Wanting a quick win', 'A past bad experience', "I don't close early"], purpose: 'Diagnoses fear-driven exits for a future class topic.' },
  { cat: 'psychology', channel: 'Facebook', q: "What affects your trading most after a loss?", opts: ['My confidence drops', 'I get impatient', 'I stop for the day', 'Nothing changes'], purpose: 'Shows how resilient the audience is after a loss.' },
  { cat: 'psychology', channel: 'WhatsApp', q: "Do you check your open trade every few minutes?", opts: ['Constantly', 'A few times', 'Rarely', 'I set it and leave'], purpose: 'Flags anxiety-driven overmonitoring.' },
  { cat: 'psychology', channel: 'Telegram', q: "How do you feel right after a winning trade?", opts: ['Confident, stay disciplined', 'Excited, want to trade more', 'Relieved', 'Already planning the next one'], purpose: 'Reveals overconfidence risk after wins.' },
  { cat: 'psychology', channel: 'WhatsApp', q: "Can you walk away after 2 losses in a row?", opts: ['Always', 'Usually', 'Rarely', 'Never'], purpose: 'Tests the community\'s ability to stop after a bad run.' },
  { cat: 'psychology', channel: 'Facebook', q: "What's harder for you — taking a loss or missing a win?", opts: ['Taking a loss', 'Missing a win', 'Both equally'], purpose: 'Uncovers the real emotional trigger behind bad entries.' },

  // --- Strategy ---
  { cat: 'strategy', channel: 'Telegram', q: "Do you follow one strategy consistently?", opts: ['Yes, always', 'Mostly', "I'm still testing different ones", "I don't have one"], purpose: 'Shows how many traders actually have a defined process.' },
  { cat: 'strategy', channel: 'WhatsApp', q: "How confident are you in your current strategy?", opts: ['Very confident', 'Somewhat confident', 'Not sure', 'Not confident'], purpose: 'A direct read on strategy-confidence across the group.' },
  { cat: 'strategy', channel: 'Telegram', q: "Do you change your strategy after a few losses?", opts: ['Never', 'Rarely', 'Sometimes', 'Often'], purpose: 'Flags strategy-hopping — a key consistency weakness.' },
  { cat: 'strategy', channel: 'Facebook', q: "Do you trade signals or your own analysis?", opts: ['My own analysis', 'Signals', 'A mix of both'], purpose: 'Measures signal-dependence in the community.' },
  { cat: 'strategy', channel: 'WhatsApp', q: "How many setups do you actually trade?", opts: ['1 setup only', '2-3 setups', '4+ setups', 'Whatever looks good'], purpose: 'Shows whether traders are focused or scattered.' },
  { cat: 'strategy', channel: 'Telegram', q: "Do you backtest a strategy before trading it live?", opts: ['Always', 'Sometimes', 'Never'], purpose: 'Flags a real education gap if backtesting is rare.' },
  { cat: 'strategy', channel: 'WhatsApp', q: "When your strategy stops working for a few days, what do you do?", opts: ['Stick with it and review', 'Pause and wait', 'Switch strategies', "Trade smaller and continue"], purpose: 'Tests process-discipline under a losing streak.' },

  // --- Fundamentals ---
  { cat: 'fundamentals', channel: 'Telegram', q: "Do you check economic news before trading?", opts: ['Always', 'Usually', 'Rarely', 'Never'], purpose: 'Shows how many traders factor in news risk.' },
  { cat: 'fundamentals', channel: 'Telegram', q: "Which news event affects your trades most?", opts: ['NFP', 'CPI / Inflation', 'Fed decisions', "I don't follow news"], purpose: 'Tells us which event content to prioritize.' },
  { cat: 'fundamentals', channel: 'WhatsApp', q: "Do you follow Fed interest rate decisions?", opts: ['Always', 'Sometimes', 'Rarely', 'Never'], purpose: 'Direct gauge of macro-awareness in the community.' },
  { cat: 'fundamentals', channel: 'Facebook', q: "Do you avoid trading during high-impact news?", opts: ['Always avoid', 'Usually avoid', 'Trade anyway', 'Don\'t track news times'], purpose: 'Flags a common, avoidable risk-management mistake.' },
  { cat: 'fundamentals', channel: 'Telegram', q: "Which affects Gold more, in your view?", opts: ['Interest rates', 'Inflation data', 'Geopolitical tension', 'US Dollar strength'], purpose: 'Sparks discussion and shows current audience thinking.' },
  { cat: 'fundamentals', channel: 'WhatsApp', q: "Do you know when the next major news event is?", opts: ['Yes, always', 'Sometimes check', 'No idea'], purpose: 'Checks real calendar awareness, not just interest.' },

  // --- Gold / BTC / Forex ---
  { cat: 'markets', channel: 'All', q: "Which market do you trade most?", opts: ['Gold (XAUUSD)', 'Forex pairs', 'Bitcoin/Crypto', 'A mix'], purpose: 'Tells us where to focus future content and signals.' },
  { cat: 'markets', channel: 'Telegram', q: "Gold or Bitcoin — which do you trust more right now?", opts: ['Gold', 'Bitcoin', 'Neither right now'], purpose: 'A quick sentiment pulse on the two most-asked assets.' },
  { cat: 'markets', channel: 'WhatsApp', q: "What's your bias today — Buy or Sell?", opts: ['Buy', 'Sell', 'Staying out today'], purpose: 'A fast daily engagement pulse tied to current price action.' },
  { cat: 'markets', channel: 'Facebook', q: "Which forex pair do you trade most?", opts: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'Other pairs'], purpose: 'Shows which pairs deserve more dedicated content.' },
  { cat: 'markets', channel: 'Telegram', q: "Do you trade Bitcoin the same way you trade Forex?", opts: ['Yes, same approach', 'No, different approach', "I don't trade crypto"], purpose: 'Reveals how traders adapt strategy across asset classes.' },
  { cat: 'markets', channel: 'WhatsApp', q: "Which asset moved your account most this month?", opts: ['Gold', 'Forex', 'Crypto', 'Nothing much moved'], purpose: 'A light monthly pulse-check across asset classes.' },

  // --- Education ---
  { cat: 'education', channel: 'All', q: "What do you want to learn next?", opts: ['Risk management', 'Chart patterns', 'Trading psychology', 'A full strategy'], purpose: 'Directly decides the next class/article topic.' },
  { cat: 'education', channel: 'Telegram', q: "Which topic is hardest for you right now?", opts: ['Reading charts', 'Controlling emotions', 'Managing risk', 'Staying consistent'], purpose: 'Surfaces the real skill gap to teach next.' },
  { cat: 'education', channel: 'WhatsApp', q: "Would you prefer live or recorded classes?", opts: ['Live classes', 'Recorded classes', 'Both'], purpose: 'Decides the best format for upcoming content.' },
  { cat: 'education', channel: 'Facebook', q: "What's the one trading skill you wish you learned earlier?", opts: ['Risk management', 'Patience', 'A real strategy', 'Journaling'], purpose: 'Reveals the highest-regret gap across experienced traders.' },
  { cat: 'education', channel: 'Telegram', q: "Do you learn better from videos or written articles?", opts: ['Videos', 'Written articles', 'Both equally'], purpose: 'Guides which content format to invest more in.' },
  { cat: 'education', channel: 'WhatsApp', q: "How do you currently learn trading?", opts: ['Free YouTube', 'Paid course', 'Community/mentor', 'Trial and error'], purpose: 'Shows where our free content fits into their journey.' },

  // --- Journaling ---
  { cat: 'journaling', channel: 'Telegram', q: "Do you maintain a trading journal?", opts: ['Yes, every trade', 'Sometimes', 'No, I don\'t'], purpose: 'A direct read on the community\'s review habits.' },
  { cat: 'journaling', channel: 'WhatsApp', q: "Do you review your losing trades afterward?", opts: ['Always', 'Usually', 'Rarely', 'Never'], purpose: 'Flags whether losses actually turn into lessons.' },
  { cat: 'journaling', channel: 'Telegram', q: "How often do you review your trading results?", opts: ['Daily', 'Weekly', 'Monthly', 'Rarely or never'], purpose: 'Shows review frequency across the community.' },
  { cat: 'journaling', channel: 'Facebook', q: "What stops you from journaling every trade?", opts: ['No time', 'Forget to', "Don't see the value", 'I already journal every trade'], purpose: 'Identifies the real blocker to fix with a simpler tool.' },
  { cat: 'journaling', channel: 'WhatsApp', q: "Would a simple trade journal tool actually help you?", opts: ['Yes, definitely', 'Maybe', 'I already have one', 'Not really'], purpose: 'Tests real demand for the Trading Journal tool.' },

  // --- Market Timing ---
  { cat: 'timing', channel: 'Telegram', q: "Which session works best for you — London, New York or Asian?", opts: ['London', 'New York', 'Asian', 'I trade whenever I can'], purpose: 'Reveals the most common trading hours in our audience.' },
  { cat: 'timing', channel: 'WhatsApp', q: "Do you trade during high-impact news releases?", opts: ['Always', 'Sometimes', 'Never'], purpose: 'Direct signal on news-timing risk exposure.' },
  { cat: 'timing', channel: 'Facebook', q: "What time do you usually enter the market?", opts: ['Early morning', 'Afternoon', 'Evening', 'Late night'], purpose: 'Helps schedule live content when the audience is active.' },
  { cat: 'timing', channel: 'Telegram', q: "Do you avoid trading right before the weekend?", opts: ['Always avoid', 'Sometimes', 'Trade normally'], purpose: 'Shows awareness of weekend gap risk.' },
  { cat: 'timing', channel: 'WhatsApp', q: "Which day of the week is your best trading day?", opts: ['Monday', 'Mid-week (Tue-Thu)', 'Friday', 'No pattern'], purpose: 'A fun, light engagement question with real pattern value.' },

  // --- Community ---
  { cat: 'community', channel: 'All', q: "What type of content should we post next?", opts: ['Market analysis', 'Educational lessons', 'Trader stories', 'Live Q&A'], purpose: 'Lets the community directly shape the content calendar.' },
  { cat: 'community', channel: 'Facebook', q: "Which topic should our next free class cover?", opts: ['Risk management', 'Gold trading', 'Trading psychology', 'Strategy building'], purpose: 'Crowdsources the next class topic from real demand.' },
  { cat: 'community', channel: 'Telegram', q: "What is your biggest trading problem right now?", opts: ['Consistency', 'Risk management', 'Emotions', 'Finding a strategy'], purpose: 'A broad, open pulse-check on the community\'s top pain point.' },
  { cat: 'community', channel: 'WhatsApp', q: "How long have you been part of this community?", opts: ['New this month', '1-6 months', '6-12 months', 'Over a year'], purpose: 'Shows the mix of new vs long-time members.' },
  { cat: 'community', channel: 'Facebook', q: "What's your #1 goal in trading this year?", opts: ['Become consistent', 'Grow my account', 'Learn properly first', 'Trade full-time'], purpose: 'Aligns future content with what members actually want.' },
  { cat: 'community', channel: 'Telegram', q: "Would you join a weekly trader accountability group?", opts: ['Yes, interested', 'Maybe', 'Not right now'], purpose: 'Tests demand for a new community engagement format.' },
];

// --- Scheduler (Section 6/7/17/18) ------------------------------------------
// Constrained randomization, not pure randomness: enforces the annual floor,
// caps same-category repetition, keeps a minimum gap before any question can
// repeat, and varies channel rather than cross-posting identically every time
// (Section 16). Deterministic inputs (a date range + what's already
// scheduled) make this safe to call repeatedly without duplicating rows —
// the caller (growth.js) still dedupes on (title, scheduled_date) before
// insert, same belt-and-suspenders pattern as seed_ideas.
const DAY_MS = 86400000;
const CHANNELS = ['Facebook', 'WhatsApp', 'Telegram', 'All'];
// Same question shouldn't repeat within this many days (Section 18) — with
// ~68 templates and a ~210/yr pace, each template is used at most ~3x/yr,
// always ≥90 days apart within a year and further apart across years.
const REPEAT_GAP_DAYS = 90;
// No more than this many posts from the same category inside any 14-day
// window (Section 17) — prevents "20 psychology polls consecutively."
const CATEGORY_WINDOW_DAYS = 14;
const CATEGORY_WINDOW_MAX = 2;

function toDateStr(d) { return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) { return toDateStr(new Date(Date.parse(dateStr) + n * DAY_MS)); }
function dateDiffDays(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS); }

// A simple mulberry32 PRNG so a schedule is reproducible for a given seed
// (useful for tests/verification) while still reading as naturally varied —
// "controlled randomization," never raw Math.random with no constraints.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/**
 * Generate a constrained-randomized poll schedule.
 * @param {string} startDate - YYYY-MM-DD, first day of the window.
 * @param {number} totalDays - length of the window (e.g. 1825 for 5 years).
 * @param {number} targetPerYear - annual floor to plan toward (default 210 —
 *   comfortably above the 200 minimum so a skipped day never risks falling
 *   short; still well inside the 200-365 preferred range).
 * @param {{title:string, category:string, date:string}[]} existing - already
 *   scheduled/completed polls (from content_library) to respect for
 *   duplicate/spacing rules across a re-run (e.g. seeding year 2 after year 1
 *   already has real history).
 * @param {number} seed - RNG seed.
 * @returns {Array} content_library-shaped poll rows (without owner_user_id).
 */
export function generatePollSchedule({ startDate, totalDays = 1825, targetPerYear = 210, existing = [], seed = 20260101 }) {
  const rng = makeRng(seed);
  const lastUsedDate = new Map(); // question -> last scheduled_date
  const categoryDates = []; // [{date, cat}] recent window, pruned as we go
  for (const e of existing) {
    if (e.title) lastUsedDate.set(e.title, e.date);
    if (e.category && e.date) categoryDates.push({ date: e.date, cat: e.category });
  }

  const schedule = [];
  const endDate = addDays(startDate, totalDays - 1);
  let yearStart = startDate;
  let yearCount = 0;
  const dailyRate = targetPerYear / 365;

  for (let offset = 0; offset < totalDays; offset++) {
    const date = addDays(startDate, offset);
    if (dateDiffDays(yearStart, date) >= 365) { yearStart = date; yearCount = 0; }

    // Pace-tracking decision, not a fixed weekday grid: behind the year's own
    // pace -> post (guarantees the annual floor is always met by year-end);
    // on/ahead of pace -> post with the base daily probability, which still
    // naturally produces 2-4 poll days most weeks rather than every day
    // (Section 6/7) while never opening a long inactive gap.
    const daysIntoYear = dateDiffDays(yearStart, date) + 1;
    const paceFloor = Math.ceil(dailyRate * daysIntoYear);
    const behindPace = yearCount < paceFloor;
    const daysLeftInYear = 365 - daysIntoYear + 1;
    const mustCatchUp = (paceFloor - yearCount) >= daysLeftInYear; // no room left to coast
    if (!behindPace && !mustCatchUp && rng() > dailyRate * 1.15) continue;

    // Prune category-window tracking to the trailing CATEGORY_WINDOW_DAYS.
    while (categoryDates.length && dateDiffDays(categoryDates[0].date, date) > CATEGORY_WINDOW_DAYS) categoryDates.shift();

    const eligibleCats = POLL_CATEGORIES.filter((c) =>
      categoryDates.filter((x) => x.cat === c.key).length < CATEGORY_WINDOW_MAX);
    const catPool = eligibleCats.length ? eligibleCats : POLL_CATEGORIES;

    // Duplicate avoidance (Section 18) comes first: search the preferred
    // (diversity-eligible) categories for a gap-respecting template; widen to
    // every category before ever reusing a question inside REPEAT_GAP_DAYS —
    // with 75 templates across 11 categories this floor is never actually
    // needed at a 200-260/yr pace, it only guards the mathematical edge case.
    const respectsGap = (p) => { const last = lastUsedDate.get(p.q); return !last || dateDiffDays(last, date) >= REPEAT_GAP_DAYS; };
    let bank = POLL_BANK.filter((p) => catPool.some((c) => c.key === p.cat) && respectsGap(p));
    if (!bank.length) bank = POLL_BANK.filter(respectsGap);
    if (!bank.length) bank = POLL_BANK; // exhausted every template's gap — reuse the least-recently-used one
    const tmpl = bank.length === POLL_BANK.length
      ? bank.slice().sort((a, b) => (lastUsedDate.get(a.q) || '') < (lastUsedDate.get(b.q) || '') ? -1 : 1)[0]
      : pick(rng, bank);

    const cat = POLL_CATEGORIES.find((c) => c.key === tmpl.cat);
    const channel = rng() < 0.55 ? tmpl.channel : pick(rng, CHANNELS);

    schedule.push({
      title: tmpl.q,
      pillar: cat.key,
      content_type: 'poll',
      status: 'idea',
      target_audience: channel,
      scheduled_date: date,
      notes: buildPollNotes(tmpl.purpose, tmpl.opts),
    });
    lastUsedDate.set(tmpl.q, date);
    categoryDates.push({ date, cat: cat.key });
    yearCount++;
  }

  return schedule;
}

// Same #META# convention as growth-page.js's buildContentMeta/parseContentMeta
// (content_library.notes) — reused here so the frontend's existing parser
// reads poll purpose/options with zero new parsing logic on that side.
// Duplicated (not imported) because this file runs in the Functions
// (server) runtime and growth-page.js runs in the browser bundle — no
// shared build step between them in this project.
export function buildPollNotes(purpose, opts) {
  const parts = [];
  if (purpose) parts.push(`purpose=${encodeURIComponent(String(purpose).trim().slice(0, 160))}`);
  if (opts && opts.length) parts.push(`opts=${encodeURIComponent(opts.join('|').slice(0, 160))}`);
  return parts.length ? `#META#${parts.join(';')}#` : '';
}

export function parsePollNotes(notes) {
  const raw = String(notes || '');
  const m = /#META#(.*?)#/.exec(raw);
  if (!m) return { purpose: '', options: [] };
  const fields = {};
  for (const kv of m[1].split(';')) {
    const i = kv.indexOf('=');
    if (i > 0) fields[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return {
    purpose: fields.purpose || '',
    options: fields.opts ? fields.opts.split('|') : [],
  };
}

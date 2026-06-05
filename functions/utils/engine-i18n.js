// functions/utils/engine-i18n.js
// ════════════════════════════════════════════════════════════════════════════
// LANGUAGE LOCK — fully-localized response BODIES (no language mixing).
//
// The specialist engines return English bodies; when the user locks a supported
// language, the orchestrator builds the answer from HERE instead — so the WHOLE
// reply is in that language. Only the whitelisted trading terms stay in English:
//   Gold · BTC · Stop Loss · Take Profit · Risk Reward · Breakout · Support ·
//   Resistance · Trend  (+ instrument codes XAU/USD, BTC/USD, VIX, DXY, etc.)
//
// Fully-localized languages: Urdu (ur), Roman Urdu (ur-roman), Arabic (ar).
// Any intent without a specific translation falls back to that language's
// `_fallback` — so output is NEVER mixed. Other languages keep the existing
// (English-body) path untouched.
// ════════════════════════════════════════════════════════════════════════════

import { loc } from './response-engine.js';
import { readProfileFacts } from './profile-recall.js';

const TG = 'https://t.me/ztradeuniversity';
const WA = 'https://wa.me/17189730347';

function money(n, dp = 2) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function pct(p) { return p == null ? '' : ` (${p > 0 ? '+' : ''}${Number(p).toFixed(2)}%)`; }

// Localized live-market snapshot (numbers universal; instrument codes whitelisted).
function snap(md, lang) {
  if (!md || md.status !== 'ok') return '';
  const L = {
    ur:        { h: '**موجودہ مارکیٹ:**', vix: 'VIX (والیٹیلیٹی)', y: 'US 10Y Yield', reg: 'مارکیٹ ریجیم' },
    'ur-roman':{ h: '**Mojooda market:**', vix: 'VIX (volatility)', y: 'US 10Y Yield', reg: 'Market regime' },
    ar:        { h: '**السوق الآن:**',      vix: 'VIX (التقلب)',    y: 'عائد US 10Y',  reg: 'حالة السوق' },
  }[lang] || { h: 'Market:', vix: 'VIX', y: 'US 10Y', reg: 'Regime' };
  const lines = [L.h];
  if (md.gold?.price != null) lines.push(`- Gold (XAU/USD): ${money(md.gold.price)}${pct(md.gold.changePct)}`);
  if (md.btc?.price  != null) lines.push(`- Bitcoin (BTC/USD): ${money(md.btc.price, 0)}${pct(md.btc.changePct)}`);
  if (md.vix?.value  != null) lines.push(`- ${L.vix}: ${md.vix.value}`);
  if (md.yields?.us10y != null) lines.push(`- ${L.y}: ${md.yields.us10y.toFixed(2)}%`);
  if (md.marketRegime?.label) lines.push(`- ${L.reg}: ${md.marketRegime.label}`);
  return lines.join('\n') + '\n\n';
}

// ── LOCALIZED BODIES (functions of ctx; concise, fully in-language) ──────────
const T = {
  // ───────────────────────── URDU ─────────────────────────
  ur: {
    _fallback: () => `میں آپ کی **Gold اور BTC** مارکیٹ، trade کے جائزے، رسک، نفسیات، broker سوالات اور trading سیکھنے میں مدد کر سکتا ہوں۔ براہِ کرم اپنا سوال بتائیں — مثلاً "آج Gold کا حال؟"، "میرا trade چیک کریں"، یا "میں بار بار کیوں ہارتا ہوں؟"`,
    greeting: () => `**السلام علیکم! میں ZTU AI Trading Assistant ہوں۔** 👋\nمیں **Gold اور BTC** کی مارکیٹ، trade کے جائزے، رسک اور نفسیات، broker سوالات اور trading کی تعلیم میں آپ کی مدد کر سکتا ہوں — آپ ہی کی زبان میں۔`,
    signal: () => `میں براہِ راست خرید/فروخت (buy/sell) **signal نہیں دیتا** — میں صرف **مارکیٹ کی تعلیم اور سیاق و سباق** فراہم کرتا ہوں۔\n\nآج کے درست setups اور signals کے لیے ہماری ٹیم یہاں شیئر کرتی ہے:\n- 📲 [Telegram پر آج کے Signals](${TG})\n- 💬 [WhatsApp چینل](${WA})\n\nاس کے علاوہ میں موجودہ مارکیٹ کا context، آپ کے اپنے trade کا جائزہ، یا news risk سمجھا سکتا ہوں۔`,
    gold: (c) => `## Gold (XAU/USD) — مارکیٹ کا تجزیہ\n${snap(c.marketData, 'ur')}**Gold کو کیا حرکت دیتا ہے:**\n- **Real yields اور Fed:** کم yields اور نرم Fed مؤقف عموماً Gold کو سہارا دیتے ہیں؛ بڑھتے yields دباؤ ڈالتے ہیں۔\n- **US Dollar (DXY):** مضبوط ڈالر Gold کے لیے رکاوٹ، کمزور ڈالر سہارا۔\n- **Safe-haven طلب:** جغرافیائی خطرات اور بلند VIX میں بڑھتی ہے۔\n\nکیا میں آپ کے اپنے Gold trade (entry، Stop Loss، Take Profit) کا جائزہ لوں؟`,
    btc: (c) => `## Bitcoin (BTC/USD) — مارکیٹ کا تجزیہ\n${snap(c.marketData, 'ur')}**BTC کے اہم محرکات:**\n- **رسک کا رجحان:** BTC ایک high-beta رسک asset کی طرح چلتا ہے — کم VIX/risk-on حالات مددگار، risk-off دباؤ۔\n- **لیکویڈیٹی اور ڈالر:** نرم عالمی لیکویڈیٹی اور کمزور ڈالر تاریخی طور پر سہارا دیتے ہیں۔\n- **ETF اور ادارہ جاتی flows:** spot-ETF کی آمد/اخراج اہم طلب کا اشارہ۔\n\nاپنے BTC trade کا entry، Stop Loss اور Take Profit بتائیں تو میں structure اور رسک کا جائزہ لوں۔`,
    macro: (c) => `## میکرو تجزیہ — DXY، Yields اور VIX\n${snap(c.marketData, 'ur')}**یہ Gold اور BTC سے کیسے جُڑے ہیں:**\n- **DXY:** Gold کے اُلٹ؛ مضبوط ڈالر دونوں پر دباؤ۔\n- **US 10Y اور real yields:** بڑھتے yields Gold پر دباؤ، گرتے yields سہارا۔\n- **VIX:** 15 سے کم = پرسکون/risk-on · 20–25 = احتیاط · 25 سے زیادہ = risk-off۔`,
    mood: (c) => `## مارکیٹ کا مزاج\n${snap(c.marketData, 'ur')}مزاج کو **سیاق و سباق** کے طور پر دیکھیں، trigger کے طور پر نہیں: risk-off/بلند VIX میں رینج چوڑی ہوتی ہے اور صبر کا فائدہ ہوتا ہے؛ پرسکون حالات میں حرکت سست ہو سکتی ہے۔`,
    session: () => `## ٹریڈنگ سیشنز (UTC)\n- **Asia:** ~00:00–09:00 — عموماً کم لیکویڈیٹی۔\n- **London:** ~08:00–17:00 — Gold کے لیے اکثر سب سے فعال۔\n- **New York:** ~13:00–22:00 — بڑی US خبریں یہیں آتی ہیں۔\n- **London/NY اوورلیپ:** ~13:00–17:00 — سب سے زیادہ لیکویڈیٹی۔`,
    brief: (c) => `## 📋 AI Daily Brief™\n${snap(c.marketData, 'ur')}آج کا فوکس: اگر کوئی high-impact خبر متوقع ہو تو spreads چوڑے اور whipsaw عام ہوتے ہیں — صبر اور سخت رسک کنٹرول اہم ہے۔ live calendar اور تفصیل کے لیے [Live Sentiment](live-sentiment.html) دیکھیں۔`,
    events: () => `## خبریں اور اقتصادی ایونٹس\n- **CPI/PPI:** افراطِ زر کے اعداد — Gold، USD اور رسک assets کو حرکت دے سکتے ہیں۔\n- **NFP:** روزگار کا ڈیٹا Fed کی توقعات بدلتا ہے۔\n- **FOMC:** Fed کا شرحِ سود کا فیصلہ اور لہجہ۔\n\n⚠️ ان خبروں کے دوران spreads چوڑے اور whipsaw عام ہوتے ہیں — بہت سے traders پہلے چند منٹ سے گریز کرتے ہیں۔`,
    whylosing: () => `## "میں بار بار کیوں ہارتا ہوں؟" — ممکنہ وجوہات\n**1. 🧠 نفسیات:** FOMO، بدلہ لینے والی trading، اپنے قواعد توڑنا۔\n**2. 🎯 execution:** تصدیق سے پہلے entry، غلط جگہ Stop Loss، winners جلدی بند کرنا۔\n**3. 🛡️ رسک:** فی trade زیادہ رسک، کمزور Risk Reward، کوئی daily loss limit نہیں۔\n**4. ⏳ صبر:** overtrading، رینج میں زبردستی trades۔\n\nاپنے profile کی درست تشخیص کے لیے **[Trader Self-Assessment](trader-assessment.html)** کریں۔`,
    stuck: (c) => `## drawdown میں پھنسے trade پر\nسب سے پہلے — یہ دباؤ فطری ہے، آئیے ٹھنڈے دل سے سوچتے ہیں۔ 🧭\n${c.marketData ? snap(c.marketData, 'ur') : ''}**ایماندارانہ بات (یہ کوئی rescue ہدایت نہیں):**\n- پھنسے trades میں **حقیقی غیر یقینی** ہوتی ہے — کوئی یقین سے نہیں کہہ سکتا کہ قیمت واپس آئے گی۔\n- ⚠️ جذباتی **averaging** اور **بدلہ لینے والی entries** سے بچیں — یہ ایک غلطی کو کئی میں بدل دیتی ہیں۔\n- مفید سوال: *"اگر ابھی میرا کوئی position نہ ہوتا، تو کیا میں موجودہ structure پر یہ trade کھولتا؟"*\n\nمیں آپ کو hold، close یا add کا نہیں کہوں گا — یہ فیصلہ آپ کے plan اور رسک حدود پر ہے۔`,
    assess: () => `## Trade کا جائزہ (تعلیمی)\nاپنا **entry، Stop Loss اور Take Profit** بھیجیں (مثلاً *"entry 2650, stop 2640, target 2675"*) تو میں آپ کا **Risk Reward** نکال کر structure کا جائزہ لوں۔ میں stop کی جگہ، target کی حقیقت پسندی اور news risk دیکھوں گا — مکمل **تعلیمی**، کوئی خرید/فروخت ہدایت نہیں۔`,
    lotsize: () => `## Position Size / Lot کیلکولیٹر (تعلیمی)\nتین چیزیں بتائیں: 1) **اکاؤنٹ سائز** 2) **فی trade رسک %** (1–2% تجویز کردہ) 3) **Stop Loss فاصلہ** (pips)۔\n_فارمولا:_ \`Lots = (Account × Risk%) ÷ (Stop pips × pip value)\`\nسنہری اصول: فی trade زیادہ سے زیادہ **1–2%** رسک تاکہ ہارنے کا سلسلہ اکاؤنٹ ختم نہ کرے۔`,
    riskmgmt: () => `## رسک مینجمنٹ — اصل برتری (تعلیمی)\n- **1–2% اصول:** فی trade ایکویٹی کا چھوٹا مقررہ % رسک کریں۔\n- **Risk Reward:** کم از کم **1:1.5**، بہتر **1:2+**۔\n- **Stop Loss = invalidation:** اسے وہاں رکھیں جہاں آئیڈیا غلط ثابت ہو — جذباتی طور پر کبھی نہ بڑھائیں۔\n- **Daily loss limit:** ایک حد کے بعد دن کے لیے رک جائیں تاکہ tilt اور بدلہ trading نہ ہو۔`,
    strategy: () => `## اپنی Trading حکمتِ عملی کا انتخاب (تعلیمی)\nکوئی ایک "بہترین" حکمتِ عملی نہیں — وہ منتخب کریں جو آپ کے وقت اور مزاج سے میل کھائے: **Scalping** (منٹ، زیادہ screen time)، **Intraday**، **Swing** (دن/ہفتے، کم screen time)، یا **Trend following**۔ برتری **مستقل مزاجی + رسک مینجمنٹ** سے آتی ہے، indicator سے نہیں۔ مناسب style کے لیے **[Trader Self-Assessment](trader-assessment.html)** کریں۔`,
    technical: () => `## ٹیکنیکل اینالائسز — بنیادی باتیں (تعلیمی)\n- **Trend:** higher highs/lows = اوپر، lower highs/lows = نیچے۔\n- **Support / Resistance:** وہ levels جہاں قیمت بار بار رکی — جتنے touches اتنے اہم۔\n- **Confluence:** بہترین setups کئی عوامل کو جوڑتے ہیں، صرف ایک indicator نہیں۔\n\n📊 chart کا screenshot upload کریں تو میں اس کا structure اور patterns پڑھ کر سمجھاؤں — تعلیمی، کوئی signal نہیں۔`,
    funding: () => `## Funded / Prop-firm چیلنج (تعلیمی)\nاصل رکاوٹ مارکیٹ نہیں، **قواعد** ہیں: **max daily loss** اور **max drawdown** کی خلاف ورزی فوراً اکاؤنٹ ختم کر دیتی ہے۔ profit target کم رسک کے ساتھ کئی trades میں حاصل ہوتا ہے — hero trades کی ضرورت نہیں۔ challenge کے دوران فی trade **0.25–0.5%** رسک اور high-impact خبروں سے گریز بہتر ہے۔\n⚠️ صرف تعلیمی — کسی مخصوص prop firm کی توثیق نہیں؛ ہمیشہ خود تصدیق کریں۔`,
    selfassess: () => `## اپنا Trader Profile جانیں\nاپنا اصل لیول، طاقتیں، کمزوریاں، رسک اور نفسیات جاننے کا بہترین طریقہ:\n👉 **[Trader Self-Assessment](trader-assessment.html)** — ایک رہنمائی شدہ تشخیص جو آپ کا لیول، behavioural profile اور ذاتی سیکھنے کا roadmap دیتی ہے۔`,
    islamic: () => `## اسلامی / حلال ٹریڈنگ — تعلیمی نوٹ\nمیں کوئی مذہبی اتھارٹی نہیں، اس لیے اسے **فتویٰ نہیں بلکہ تعلیم** سمجھیں — حتمی فیصلے کے لیے کسی مستند عالم سے رجوع کریں۔\n- **Riba (سود):** overnight swap/rollover چارجز سود پر مبنی ہوتے ہیں۔ کئی brokers **swap-free / Islamic accounts** دیتے ہیں جو انہیں ختم کر دیتے ہیں۔\n- **Gharar اور leverage:** زیادہ leverage اور خالص قیاس آرائی پر اختلاف ہے؛ واضح تجزیہ اور کم رسک کو بہت سے علماء بہتر سمجھتے ہیں۔\n- **اثاثے کی ملکیت:** حقیقی ملکیتی اثاثوں کی trading بمقابلہ خالص derivatives بھی بحث کا حصہ ہے۔\n\nعملی اقدامات: **swap-free account** استعمال کریں، سود سے بچیں، تجزیے سے trade کریں (جوا نہیں)، اور اپنی صورتحال کے لیے کسی **عالم** سے پوچھیں۔`,
    broker: () => `## Broker مدد\nمیں **account types**، ریگولیشن کی تصدیق، deposit/withdrawal، MT5 login مسائل، spreads/commission، leverage اور margin میں مدد کر سکتا ہوں۔ تفصیلی معلومات: Exness, HFM, Octa, IC Markets, FBS, XM۔ مثلاً پوچھیں: *"کیا IC Markets ریگولیٹڈ ہے؟"* یا *"Raw vs Standard account؟"*`,
    platform: (c) => c.platform === 'tradingview'
      ? `## TradingView — فوری مدد\n- **Indicator شامل کریں:** اوپر toolbar → *Indicators* → تلاش کریں (RSI, EMA)۔\n- **Trendline:** بائیں toolbar → trendline tool → دو points۔\n- **Alert:** chart پر right-click → *Add Alert*۔\nآفیشل مدد: [TradingView Help](https://www.tradingview.com/support/)`
      : `## MetaTrader (MT4/MT5) — فوری مدد\n- **Order لگائیں:** *New Order* (F9) → symbol، volume (lots)، Stop Loss/Take Profit مقرر کریں۔\n- **SL/TP بدلیں:** *Trade* tab میں position پر right-click → *Modify*۔\n- **"invalid account":** login number، password اور خاص طور پر درست **server name** دوبارہ چیک کریں۔\nآفیشل docs: [MetaTrader 5 Help](https://www.metatrader5.com/en/help)`,
    knowledge: (c) => {
      const e = (c.knowledgeEntries || [])[0];
      if (e) return `## ${e.title}\n${e.summary || (e.content || '').slice(0, 500)}\n\n_(تفصیلی مواد ہماری knowledge base سے۔)_`;
      return `میں اپنی knowledge base سے اسباق شیئر کر سکتا ہوں — **Mark Douglas (Trading in the Zone)**، **Van Tribe/Van Tharp (position sizing)**، **Market Wizards**، نفسیات، beginner roadmap اور glossary۔ کون سا چاہیں؟`;
    },
    psychology: (c) => T.ur.knowledge(c),
    setcountry: () => `آپ کس ملک سے trading کرتے ہیں؟ (مثلاً پاکستان، انڈیا، انڈونیشیا، UAE…) میں یاد رکھ کر تمام ایونٹ اور سیشن اوقات آپ کے مقامی time میں دکھاؤں گا۔`,
    profileinfo: (c) => {
      const facts = c.facts || [];
      const parts = []; let fu = '';
      for (const f of facts) {
        if (f.category === 'favorite-instrument') { parts.push(`آپ بنیادی طور پر **${f.value}** پر فوکس کرتے ہیں`); fu = `کیا میں **${f.value}** کا market context آپ کے انداز کے مطابق بناؤں؟`; }
        else if (f.category === 'trading-style')   { parts.push(`آپ **${f.value}** انداز میں trade کرتے ہیں`); fu = fu || `کیا اس style کے لیے رسک کنٹرول کی مختصر وضاحت دوں؟`; }
        else if (f.category === 'experience')      { parts.push(`آپ **${f.value}** لیول پر ہیں`); fu = fu || `میں آسان اور بنیادی انداز میں سمجھاؤں گا۔ آپ زیادہ تر **Gold** یا **BTC** trade کرتے ہیں؟`; }
        else if (f.category === 'goal')            { parts.push(`میں نے آپ کا مقصد نوٹ کر لیا`); fu = fu || `کیا اس مقصد کے لیے کم رسک والا سادہ پلان دوں؟`; }
      }
      const ack = parts.length ? `سمجھ گیا — میں یاد رکھوں گا کہ ${parts.join(' اور ')}۔ ✅` : `سمجھ گیا۔ ✅`;
      return `${ack}\n\n${fu || 'آپ کیا دیکھنا چاہیں گے — **market context**، **trade کا جائزہ**، یا **psychology**؟'}`;
    },
    offtopic: () => `میں آپ کا **trading assistant** ہوں — میں صرف markets پر بات کرتا ہوں: **Gold**، **BTC**، market context، trade کا جائزہ، رسک اور psychology۔ یہ میرے دائرے سے باہر ہے، لیکن trading کے کسی بھی سوال کے لیے حاضر ہوں۔`,
    career: (c) => {
      const f = readProfileFacts(c);
      const inst = f.instrument ? `**${f.instrument}** ٹریڈر کے طور پر، ` : '';
      return `## منافع بخش ٹریڈر کیسے بنیں (تعلیمی)\n${inst}جو ٹریڈرز ٹکتے ہیں وہ perfect entry نہیں ڈھونڈتے — وہ اسے ایک **عمل** سمجھتے ہیں:\n- **🛡️ پہلے رسک:** فی trade صرف **1–2%** رسک تاکہ ہارنے کا سلسلہ ختم نہ کرے۔\n- **🔁 مستقل مزاجی:** ایک قابلِ تکرار setup نظم کے ساتھ۔\n- **🧠 نفسیات ہی برتری ہے:** FOMO، بدلہ اور بے صبری زیادہ اکاؤنٹ ختم کرتی ہے۔\n- **📈 Compounding:** چھوٹے مستقل منافع بڑھتے ہیں۔\n- **📓 جائزہ:** اپنے trades journal کریں اور غلطیوں سے سیکھیں۔\n\nدولت ٹریڈنگ سے skill + رسک کنٹرول + صبر کا **نتیجہ** ہے، لمحاتی ہدف نہیں۔ کیا beginner roadmap، risk management یا psychology سے شروع کریں؟`;
    },
    aboutme: (c) => {
      const f = readProfileFacts(c);
      if (!f.hasData) return `## آپ کے بارے میں\nہم ابھی ایک دوسرے کو جان رہے ہیں — میرے پاس زیادہ معلومات محفوظ نہیں۔ یہ بتائیں تو میں یاد رکھوں گا:\n- آپ زیادہ تر کیا trade کرتے ہیں؟ (Gold، BTC)\n- آپ کا تجربہ؟ (beginner / intermediate / advanced)\n- آپ کا انداز؟ (scalping، intraday، swing)`;
      let o = `## میں آپ کے بارے میں کیا جانتا ہوں\n`;
      if (f.instrument)        o += `- 🎯 آپ بنیادی طور پر **${f.instrument}** پر فوکس کرتے ہیں\n`;
      if (f.level)             o += `- 📈 تجربہ: **${f.level}**\n`;
      if (f.style)             o += `- 🧭 انداز: **${f.style}**\n`;
      if (f.convs)             o += `- 💬 ہم **${f.convs}** گفتگو کر چکے ہیں\n`;
      if (f.strengths.length)  o += `- ✅ طاقتیں: ${f.strengths.join('، ')}\n`;
      if (f.weaknesses.length) o += `- ⚠️ بہتری کے شعبے: ${f.weaknesses.join('، ')}\n`;
      if (f.psych.length)      o += `- 🧠 نفسیاتی رجحانات: ${f.psych.join('، ')}\n`;
      return o + `\nمیں اسی کو مدِنظر رکھ کر جواب دیتا ہوں۔ کیا ${f.instrument || 'مارکیٹ'} پر بات کریں؟`;
    },
    chart: () => `## 📊 Chart Intelligence\nmessage box کے ساتھ موجود **image button** سے اپنے chart کا screenshot upload کریں — میں اس کا **Trend، Support/Resistance** اور patterns (Double Top/Bottom، triangle، channel، range، BOS، CHOCH) پڑھ کر **امکان اور منطق** سمجھاؤں گا (کوئی signal نہیں)۔`,
  },

  // ──────────────────── ROMAN URDU ────────────────────
  'ur-roman': {
    _fallback: () => `Main aap ki **Gold aur BTC** market, trade ke jaaize, risk, psychology, broker sawalat aur trading seekhne mein madad kar sakta hoon. Apna sawal poochein — masalan "Aaj Gold ka haal?", "Mera trade check karein", ya "Main baar baar kyun haarta hoon?"`,
    greeting: () => `**Assalam o Alaikum! Main ZTU AI Trading Assistant hoon.** 👋\nMain **Gold aur BTC** market, trade ke jaaize, risk & psychology, broker sawalat aur trading ki taleem mein aap ki madad kar sakta hoon — aap hi ki zaban mein.`,
    signal: () => `Main direct buy/sell **signal nahi deta** — sirf **market ki taleem aur context** deta hoon.\n\nAaj ke exact setups aur signals ke liye hamari team yahan share karti hai:\n- 📲 [Telegram par aaj ke Signals](${TG})\n- 💬 [WhatsApp channel](${WA})\n\nIs ke ilawa main mojooda market context, aap ke apne trade ka jaaiza, ya news risk samjha sakta hoon.`,
    gold: (c) => `## Gold (XAU/USD) — Market Analysis\n${snap(c.marketData, 'ur-roman')}**Gold ko kya move karta hai:**\n- **Real yields & Fed:** kam yields aur naram Fed aam tor par Gold ko sahara dete hain.\n- **US Dollar (DXY):** mazboot dollar Gold par dabao, kamzor dollar sahara.\n- **Safe-haven demand:** geopolitical risk aur buland VIX mein barhti hai.\n\nKya main aap ke apne Gold trade (entry, Stop Loss, Take Profit) ka jaaiza loon?`,
    btc: (c) => `## Bitcoin (BTC/USD) — Market Analysis\n${snap(c.marketData, 'ur-roman')}**BTC ke ahem drivers:**\n- **Risk appetite:** BTC high-beta risk asset ki tarah chalta hai — kam VIX/risk-on madadgaar, risk-off dabao.\n- **Liquidity & dollar:** naram liquidity aur kamzor dollar sahara dete hain.\n- **ETF flows:** spot-ETF ki aamad/ikhraaj ahem demand signal.\n\nApne BTC trade ka entry, Stop Loss aur Take Profit batayein.`,
    macro: (c) => `## Macro Analysis — DXY, Yields & VIX\n${snap(c.marketData, 'ur-roman')}- **DXY:** Gold ke ulat; mazboot dollar dono par dabao.\n- **US 10Y / real yields:** barhte yields Gold par dabao, girte yields sahara.\n- **VIX:** 15 se kam = risk-on · 20–25 = ehtiyaat · 25+ = risk-off.`,
    mood: (c) => `## Market ka Mood\n${snap(c.marketData, 'ur-roman')}Mood ko **context** ki tarah dekhein, trigger ki tarah nahi: risk-off/buland VIX mein range chaurri hoti hai; pursukoon haalat mein move sust ho sakti hai.`,
    session: () => `## Trading Sessions (UTC)\n- **Asia:** ~00:00–09:00 — aam tor par kam liquidity.\n- **London:** ~08:00–17:00 — Gold ke liye aksar sab se active.\n- **New York:** ~13:00–22:00 — bari US khabrein yahin.\n- **London/NY overlap:** ~13:00–17:00 — sab se zyada liquidity.`,
    brief: (c) => `## 📋 AI Daily Brief™\n${snap(c.marketData, 'ur-roman')}Aaj ka focus: agar koi high-impact khabar ho to spreads chaurre aur whipsaw aam hote hain — sabar aur sakht risk control ahem. Live calendar ke liye [Live Sentiment](live-sentiment.html) dekhein.`,
    events: () => `## Khabrein aur Economic Events\n- **CPI/PPI:** inflation ke aankrre — Gold, USD aur risk assets ko move kar sakte hain.\n- **NFP:** rozgar ka data Fed ki tawaqqu'aat badalta hai.\n- **FOMC:** Fed ka rate faisla aur lehja.\n\n⚠️ In khabron ke doran spreads chaurre aur whipsaw aam — bohat se traders pehle chand minute se gurez karte hain.`,
    whylosing: () => `## "Main baar baar kyun haarta hoon?"\n**1. 🧠 Psychology:** FOMO, revenge trading, apne rules torna.\n**2. 🎯 Execution:** confirmation se pehle entry, ghalat jagah Stop Loss, winners jaldi band karna.\n**3. 🛡️ Risk:** per-trade zyada risk, kamzor Risk Reward, koi daily loss limit nahi.\n**4. ⏳ Sabar:** overtrading, range mein zabardasti trades.\n\nDurust tashkhees ke liye **[Trader Self-Assessment](trader-assessment.html)** karein.`,
    stuck: (c) => `## Drawdown mein phanse trade par\nPehle — yeh dabao fitri hai, aayiye thande dil se sochte hain. 🧭\n${c.marketData ? snap(c.marketData, 'ur-roman') : ''}- Phanse trades mein **haqeeqi غیر-yaqeeni** hoti hai — koi yaqeen se nahi keh sakta qeemat wapas aaye gi.\n- ⚠️ Jazbaati **averaging** aur **revenge entries** se bachein.\n- Mufeed sawal: *"Agar abhi koi position na hota, to kya main yeh trade kholta?"*\n\nMain hold/close/add ka nahi kahoonga — yeh faisla aap ke plan par hai.`,
    assess: () => `## Trade ka Jaaiza (taleemi)\nApna **entry, Stop Loss aur Take Profit** bhejein (masalan *"entry 2650, stop 2640, target 2675"*) to main aap ka **Risk Reward** nikaal kar structure ka jaaiza loon — mukammal taleemi, koi buy/sell hidayat nahi.`,
    lotsize: () => `## Position Size / Lot Calculator (taleemi)\nTeen cheezein batayein: 1) **account size** 2) **per-trade risk %** (1–2%) 3) **Stop Loss faasla** (pips).\n_Formula:_ \`Lots = (Account × Risk%) ÷ (Stop pips × pip value)\`\nGolden rule: per trade max **1–2%** risk.`,
    riskmgmt: () => `## Risk Management — asal bartari (taleemi)\n- **1–2% rule:** per trade equity ka chhota muqarrar % risk.\n- **Risk Reward:** kam az kam **1:1.5**, behtar **1:2+**.\n- **Stop Loss = invalidation:** wahan rakhein jahan idea ghalat sabit ho — jazbaati tor par kabhi na barhayein.\n- **Daily loss limit:** ek had ke baad ruk jayein.`,
    strategy: () => `## Apni Strategy ka intikhaab (taleemi)\nKoi ek "best" strategy nahi — **Scalping** (minute, zyada screen time), **Intraday**, **Swing** (din/hafte), ya **Trend following**. Bartari **consistency + risk management** se aati hai. Munasib style ke liye **[Trader Self-Assessment](trader-assessment.html)** karein.`,
    technical: () => `## Technical Analysis — buniyadi baatein (taleemi)\n- **Trend:** higher highs/lows = upar, lower highs/lows = neeche.\n- **Support / Resistance:** woh levels jahan qeemat baar baar ruki.\n- **Confluence:** behtareen setups kai factors jorte hain.\n\n📊 Chart ka screenshot upload karein to main uska structure aur patterns parh kar samjhaaoon — taleemi, koi signal nahi.`,
    funding: () => `## Funded / Prop-firm challenge (taleemi)\nAsal rukawat **rules** hain: **max daily loss** aur **max drawdown** ki khilaaf-warzi foran account khatam kar deti hai. Profit target kam risk ke saath kai trades mein milta hai — hero trades ki zaroorat nahi. Challenge mein per trade **0.25–0.5%** risk behtar.\n⚠️ Sirf taleemi — kisi prop firm ki tauseeq nahi.`,
    selfassess: () => `## Apna Trader Profile janein\n👉 **[Trader Self-Assessment](trader-assessment.html)** — ek guided diagnostic jo aap ka level, behavioural profile aur zaati learning roadmap deta hai.`,
    islamic: () => `## Islamic / Halal Trading — taleemi note\nMain koi mazhabi authority nahi — ise **fatwa nahi, taleem** samjhein; hatmi faisle ke liye mustanad aalim se rujoo karein.\n- **Riba (sood):** overnight swap/rollover charges sood par mabni hain. Kai brokers **swap-free / Islamic accounts** dete hain jo inhein khatam karte hain.\n- **Gharar aur leverage:** zyada leverage aur khaalis qiyaas-aaraai par ikhtilaaf hai; wazeh tajziya aur kam risk behtar.\n- **Asset ownership:** haqeeqi owned assets vs pure derivatives bhi behes ka hissa hai.\n\nAmli qadam: **swap-free account** istemaal karein, sood se bachein, tajziye se trade karein (juaa nahi), aur apni surat-e-haal ke liye **aalim** se poochein.`,
    broker: () => `## Broker Madad\nMain **account types**, regulation ki tasdeeq, deposit/withdrawal, MT5 login masail, spreads/commission, leverage aur margin mein madad kar sakta hoon. Brokers: Exness, HFM, Octa, IC Markets, FBS, XM. Masalan: *"Kya IC Markets regulated hai?"*`,
    platform: (c) => c.platform === 'tradingview'
      ? `## TradingView — foori madad\n- **Indicator:** toolbar → *Indicators* → search (RSI, EMA).\n- **Trendline:** left toolbar → trendline tool.\n- **Alert:** chart par right-click → *Add Alert*.\n[TradingView Help](https://www.tradingview.com/support/)`
      : `## MetaTrader (MT4/MT5) — foori madad\n- **Order:** *New Order* (F9) → symbol, volume (lots), Stop Loss/Take Profit.\n- **SL/TP:** *Trade* tab mein position par right-click → *Modify*.\n- **"invalid account":** login, password aur durust **server name** check karein.\n[MetaTrader 5 Help](https://www.metatrader5.com/en/help)`,
    knowledge: (c) => { const e = (c.knowledgeEntries || [])[0]; return e ? `## ${e.title}\n${e.summary || (e.content || '').slice(0, 500)}` : `Main knowledge base se asbaaq share kar sakta hoon — Mark Douglas, Van Tharp, Market Wizards, psychology, beginner roadmap, glossary. Kaun sa chahein?`; },
    psychology: (c) => T['ur-roman'].knowledge(c),
    setcountry: () => `Aap kis mulk se trading karte hain? (Pakistan, India, Indonesia, UAE…) Main yaad rakh kar tamam event aur session auqaat aap ke local time mein dikhaoon ga.`,
    profileinfo: (c) => {
      const facts = c.facts || [];
      const parts = []; let fu = '';
      for (const f of facts) {
        if (f.category === 'favorite-instrument') { parts.push(`aap mukhya tor par **${f.value}** par focus karte hain`); fu = `Kya main **${f.value}** ka market context aap ke andaaz ke mutabiq banaoon?`; }
        else if (f.category === 'trading-style')   { parts.push(`aap **${f.value}** andaaz mein trade karte hain`); fu = fu || `Kya is style ke liye risk control ki mukhtasar wazahat doon?`; }
        else if (f.category === 'experience')      { parts.push(`aap **${f.value}** level par hain`); fu = fu || `Main aasan aur buniyadi andaaz mein samjhaoon ga. Aap zyada tar **Gold** ya **BTC** trade karte hain?`; }
        else if (f.category === 'goal')            { parts.push(`main ne aap ka maqsad note kar liya`); fu = fu || `Kya is maqsad ke liye kam-risk wala saada plan doon?`; }
      }
      const ack = parts.length ? `Samajh gaya — main yaad rakhoon ga ke ${parts.join(' aur ')}. ✅` : `Samajh gaya. ✅`;
      return `${ack}\n\n${fu || 'Aap kya dekhna chahenge — **market context**, **trade ka jaaiza**, ya **psychology**?'}`;
    },
    offtopic: () => `Main aap ka **trading assistant** hoon — main sirf markets par baat karta hoon: **Gold**, **BTC**, market context, trade ka jaaiza, risk aur psychology. Yeh mere daire se bahar hai, lekin trading ke kisi bhi sawal ke liye hazir hoon.`,
    career: (c) => {
      const f = readProfileFacts(c);
      const inst = f.instrument ? `**${f.instrument}** trader ke tor par, ` : '';
      return `## Profitable trader kaise banein (taleemi)\n${inst}jo traders tikte hain woh perfect entry nahi dhoondte — woh ise ek **process** samajhte hain:\n- **🛡️ Pehle risk:** per trade sirf **1–2%** risk.\n- **🔁 Consistency:** ek repeatable setup discipline ke saath.\n- **🧠 Psychology hi edge hai:** FOMO, revenge, be-sabri zyada account khatam karti hai.\n- **📈 Compounding:** chhote mustaqil munafe barhte hain.\n- **📓 Review:** apne trades journal karein.\n\nDaulat trading se skill + risk control + sabar ka **nateeja** hai. Kya beginner roadmap, risk management ya psychology se shuru karein?`;
    },
    aboutme: (c) => {
      const f = readProfileFacts(c);
      if (!f.hasData) return `## Aap ke baare mein\nHum abhi ek doosre ko jaan rahe hain — mere paas zyada maloomat mehfooz nahi. Yeh batayein to main yaad rakhoon ga:\n- Aap zyada tar kya trade karte hain? (Gold, BTC)\n- Aap ka tajurba? (beginner / intermediate / advanced)\n- Aap ka andaaz? (scalping, intraday, swing)`;
      let o = `## Main aap ke baare mein kya jaanta hoon\n`;
      if (f.instrument)        o += `- 🎯 Aap mukhya tor par **${f.instrument}** par focus karte hain\n`;
      if (f.level)             o += `- 📈 Tajurba: **${f.level}**\n`;
      if (f.style)             o += `- 🧭 Andaaz: **${f.style}**\n`;
      if (f.convs)             o += `- 💬 Hum **${f.convs}** baat-cheet kar chuke hain\n`;
      if (f.strengths.length)  o += `- ✅ Taqatein: ${f.strengths.join(', ')}\n`;
      if (f.weaknesses.length) o += `- ⚠️ Behtari ke shobe: ${f.weaknesses.join(', ')}\n`;
      if (f.psych.length)      o += `- 🧠 Psychology patterns: ${f.psych.join(', ')}\n`;
      return o + `\nMain isi ko madde-nazar rakh kar jawab deta hoon. Kya ${f.instrument || 'market'} par baat karein?`;
    },
    chart: () => `## 📊 Chart Intelligence\nMessage box ke sath **image button** se apne chart ka screenshot upload karein — main uska **Trend, Support/Resistance** aur patterns (Double Top/Bottom, triangle, channel, range, BOS, CHOCH) parh kar **probability aur logic** samjhaaoon ga (koi signal nahi).`,
  },

  // ───────────────────────── ARABIC ─────────────────────────
  ar: {
    _fallback: () => `يمكنني مساعدتك في سوق **Gold و BTC**، وتقييم الصفقات، وإدارة المخاطر والسيكولوجيا، وأسئلة الوسطاء، وتعليم التداول. اطرح سؤالك — مثل "كيف حال Gold اليوم؟"، "راجع صفقتي"، أو "لماذا أخسر باستمرار؟"`,
    greeting: () => `**مرحباً! أنا مساعد ZTU AI للتداول.** 👋\nيمكنني مساعدتك في سياق سوق **Gold و BTC**، وتقييم الصفقات، وإدارة المخاطر والسيكولوجيا، وأسئلة الوسطاء، وتعليم التداول — بلغتك.`,
    signal: () => `أنا **لا أقدّم إشارات شراء/بيع مباشرة (buy/sell signal)** — أركّز على **تعليم السوق وسياقه** فقط.\n\nللحصول على إعدادات وإشارات اليوم الدقيقة، يشاركها فريقنا هنا:\n- 📲 [إشارات اليوم على Telegram](${TG})\n- 💬 [قناة WhatsApp](${WA})\n\nكما يمكنني شرح سياق السوق الحالي، أو مراجعة صفقتك أنت، أو فحص مخاطر الأخبار.`,
    gold: (c) => `## Gold (XAU/USD) — تحليل السوق\n${snap(c.marketData, 'ar')}**ما الذي يحرّك Gold:**\n- **Real yields و Fed:** انخفاض العوائد والموقف المتساهل يدعم Gold عادةً.\n- **US Dollar (DXY):** الدولار القوي عائق، والضعيف داعم.\n- **الطلب على الملاذ الآمن:** يرتفع مع المخاطر الجيوسياسية و VIX المرتفع.\n\nهل أراجع صفقتك على Gold (entry، Stop Loss، Take Profit)؟`,
    btc: (c) => `## Bitcoin (BTC/USD) — تحليل السوق\n${snap(c.marketData, 'ar')}**أهم محرّكات BTC:**\n- **شهية المخاطرة:** يتحرّك BTC كأصل عالي المخاطر — VIX المنخفض/risk-on يدعمه.\n- **السيولة والدولار:** السيولة المرنة والدولار الضعيف داعمان تاريخياً.\n- **تدفّقات ETF:** دخول/خروج صناديق ETF إشارة طلب مهمة.\n\nشاركني entry و Stop Loss و Take Profit لمراجعة الـ structure والمخاطر.`,
    macro: (c) => `## تحليل الماكرو — DXY و Yields و VIX\n${snap(c.marketData, 'ar')}- **DXY:** عكس Gold؛ الدولار القوي ضغط على الاثنين.\n- **US 10Y / real yields:** ارتفاع العوائد ضغط على Gold، انخفاضها دعم.\n- **VIX:** أقل من 15 = risk-on · 20–25 = حذر · أكثر من 25 = risk-off.`,
    mood: (c) => `## مزاج السوق\n${snap(c.marketData, 'ar')}اعتبر المزاج **سياقاً** لا محفّزاً: ظروف risk-off / VIX المرتفع توسّع النطاق وتكافئ الصبر.`,
    whylosing: () => `## "لماذا أخسر باستمرار؟"\n**1. 🧠 السيكولوجيا:** دخول FOMO، التداول الانتقامي، كسر قواعدك.\n**2. 🎯 التنفيذ:** الدخول قبل التأكيد، Stop Loss في مكان خاطئ.\n**3. 🛡️ المخاطر:** مخاطرة كبيرة لكل صفقة، Risk Reward ضعيف.\n**4. ⏳ الصبر:** الإفراط في التداول.\n\nللتشخيص الدقيق، أجرِ **[Trader Self-Assessment](trader-assessment.html)**.`,
    stuck: (c) => `## بخصوص صفقة في خسارة (drawdown)\nأولاً — هذا التوتر طبيعي، لنفكّر بهدوء. 🧭\n${c.marketData ? snap(c.marketData, 'ar') : ''}- الصفقات المتعثّرة تحمل **عدم يقين حقيقي**.\n- ⚠️ احذر **averaging** العاطفي و**الدخول الانتقامي**.\n- سؤال مفيد: *"لو لم يكن لديّ مركز الآن، هل كنت سأفتح هذه الصفقة؟"*\n\nلن أطلب منك الاحتفاظ أو الإغلاق أو الإضافة — القرار لك ولخطتك.`,
    assess: () => `## تقييم الصفقة (تعليمي)\nأرسل **entry و Stop Loss و Take Profit** (مثل *"entry 2650, stop 2640, target 2675"*) لأحسب **Risk Reward** وأراجع الـ structure — تعليمي بالكامل، دون أي توصية شراء/بيع.`,
    islamic: () => `## التداول الإسلامي / الحلال — ملاحظة تعليمية\nلستُ جهة دينية، لذا اعتبر هذا **تعليماً لا فتوى** — للحكم النهائي استشر عالماً موثوقاً.\n- **الربا:** رسوم swap/rollover الليلية قائمة على الفائدة. كثير من الوسطاء يوفّرون **حسابات swap-free / إسلامية** تلغيها.\n- **الغرر والرافعة:** الرافعة العالية والمضاربة البحتة محل نقاش؛ التحليل الواضح والمخاطر الأقل أفضل عند كثيرين.\n- **ملكية الأصل:** تداول أصول حقيقية مملوكة مقابل المشتقات جزء من النقاش.\n\nخطوات عملية: استخدم **حساب swap-free**، تجنّب الفوائد، تداول بتحليل (لا قمار)، واسأل **عالماً** عن حالتك.`,
    broker: () => `## مساعدة الوسطاء\nأساعدك في **أنواع الحسابات**، التحقق من التنظيم، الإيداع/السحب، مشاكل تسجيل دخول MT5، الـ spreads/commission، الـ leverage والـ margin. الوسطاء: Exness, HFM, Octa, IC Markets, FBS, XM.`,
    career: (c) => {
      const f = readProfileFacts(c);
      const inst = f.instrument ? `بصفتك متداول **${f.instrument}**، ` : '';
      return `## كيف تصبح متداولاً مربحاً (تعليمي)\n${inst}المتداولون الذين يستمرون لا يطاردون الدخول المثالي — يتعاملون معه كـ**عملية**:\n- **🛡️ المخاطر أولاً:** خاطر بـ**1–2%** فقط لكل صفقة.\n- **🔁 الاستمرارية:** إعداد واحد متكرر بانضباط.\n- **🧠 السيكولوجيا هي الميزة:** FOMO والانتقام ونفاد الصبر تدمّر الحسابات.\n- **📈 التراكم:** الأرباح الصغيرة الثابتة تتراكم.\n- **📓 المراجعة:** دوّن صفقاتك وتعلّم من أخطائك.\n\nالثروة من التداول **نتيجة** للمهارة وإدارة المخاطر والصبر، لا هدف لحظي. هل نبدأ بخارطة المبتدئين، أو إدارة المخاطر، أو السيكولوجيا؟`;
    },
    aboutme: (c) => {
      const f = readProfileFacts(c);
      if (!f.hasData) return `## ماذا أعرف عنك\nما زلنا نتعرّف على بعضنا — لا أملك الكثير محفوظاً بعد. أخبرني ببعض الأمور وسأتذكّرها:\n- ما الذي تتداوله غالباً؟ (Gold، BTC)\n- مستوى خبرتك؟ (مبتدئ / متوسط / متقدّم)\n- أسلوبك؟ (scalping، intraday، swing)`;
      let o = `## ما الذي أتذكّره عنك\n`;
      if (f.instrument)        o += `- 🎯 تركّز أساساً على **${f.instrument}**\n`;
      if (f.level)             o += `- 📈 مستوى الخبرة: **${f.level}**\n`;
      if (f.style)             o += `- 🧭 أسلوب التداول: **${f.style}**\n`;
      if (f.convs)             o += `- 💬 تحدّثنا عبر **${f.convs}** محادثة\n`;
      if (f.strengths.length)  o += `- ✅ نقاط القوة: ${f.strengths.join('، ')}\n`;
      if (f.weaknesses.length) o += `- ⚠️ مجالات للتحسين: ${f.weaknesses.join('، ')}\n`;
      if (f.psych.length)      o += `- 🧠 أنماط نفسية لاحظتها: ${f.psych.join('، ')}\n`;
      return o + `\nأستخدم هذا لأخصّص إجاباتي. هل نتعمّق في ${f.instrument || 'السوق'}؟`;
    },
    profileinfo: (c) => {
      const facts = c.facts || [];
      const parts = []; let fu = '';
      for (const f of facts) {
        if (f.category === 'favorite-instrument') { parts.push(`تركّز أساساً على **${f.value}**`); fu = `هل أخصّص سياق سوق **${f.value}** حسب أسلوبك؟`; }
        else if (f.category === 'trading-style')   { parts.push(`تتداول بأسلوب **${f.value}**`); fu = fu || `هل أعطيك ملخّصاً سريعاً لإدارة المخاطر لهذا الأسلوب؟`; }
        else if (f.category === 'experience')      { parts.push(`مستواك **${f.value}**`); fu = fu || `سأبقي الشرح واضحاً وأساسياً. ماذا تتداول غالباً — **Gold** أم **BTC**؟`; }
        else if (f.category === 'goal')            { parts.push(`سجّلت هدفك`); fu = fu || `هل أقترح خطة بسيطة منخفضة المخاطر لتحقيقه؟`; }
      }
      const ack = parts.length ? `حسناً — سأتذكّر أن ${parts.join(' و')}. ✅` : `حسناً، سجّلت ذلك. ✅`;
      return `${ack}\n\n${fu || 'ماذا تريد أن نتناول — **سياق السوق**، **مراجعة صفقة**، أو **السيكولوجيا**؟'}`;
    },
    offtopic: () => `أنا **مساعد التداول** الخاص بك — أركّز على الأسواق: **Gold**، **BTC**، سياق السوق، مراجعة الصفقات، المخاطر والسيكولوجيا. هذا خارج نطاقي، لكنني جاهز لأي سؤال عن التداول.`,
    chart: () => `## 📊 ذكاء الشارت\nارفع لقطة شاشة للشارت عبر **زر الصورة** بجانب صندوق الرسائل — سأقرأ الـ **Trend و Support/Resistance** والأنماط (Double Top/Bottom، triangle، channel، range، BOS، CHOCH) وأشرح **الاحتمال والمنطق** (دون أي signal).`,
  },
};

// Localized "expand" suffix (Module: follow-up "explain more" in-language).
const EXPAND = {
  ur:        `\n\n**مزید گہرائی:** کیا میں کسی ایک پہلو پر تفصیل دوں — **technical structure**، **macro (real yields/DXY)**، **sentiment** یا **psychology**؟ بتائیں، صرف اسی پر بات کرتا ہوں۔`,
  'ur-roman':`\n\n**Mazeed gehrai:** kya main kisi aik pehlu par tafseel doon — **technical structure**, **macro (real yields/DXY)**, **sentiment** ya **psychology**? Batayein.`,
  ar:        `\n\n**تعمّق أكثر:** هل أفصّل في جانب واحد — **الـ structure الفني**، **الماكرو (real yields/DXY)**، **المعنويات** أو **السيكولوجيا**؟ أخبرني.`,
};

export function hasLocale(lang) { return !!T[lang]; }

export function localizedExpand(lang) { return EXPAND[lang] || ''; }

// Build a fully-localized body (+ localized disclaimer). Falls back within the
// same language (never English) so output is never mixed.
export function localizedBody(intent, lang, ctx) {
  const table = T[lang];
  if (!table) return null;
  const fn = table[intent] || table._fallback;
  let body;
  try { body = typeof fn === 'function' ? fn(ctx || {}) : fn; }
  catch { body = (typeof table._fallback === 'function' ? table._fallback(ctx || {}) : table._fallback); }
  return body + '\n\n' + loc(lang).disclaimer;
}

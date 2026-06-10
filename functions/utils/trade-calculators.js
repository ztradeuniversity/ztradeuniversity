// functions/utils/trade-calculators.js
// ════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC TRADING CALCULATORS (never hallucinate)
// Pure math for the numbers beginners search for daily: lot/position size, pip
// value, risk-to-reward, margin, profit/loss. The engine already EXPLAINS the
// formulas (lotsize intent); this ADDS the actual computed answer when the user
// gives numbers — with the calculation shown, so it's verifiable and exact.
//
// Conventions match the existing system prompt: Gold (XAU/USD) ≈ $10 per pip per
// standard lot (0.01 lot = $0.10/pip); FX majors (USD-quote) ≈ $10/pip/std lot.
// Pure (no I/O). Language-Lock safe (localized labels; numbers are universal).
// ════════════════════════════════════════════════════════════════════════════

function instrumentOf(text) {
  const s = String(text || '').toLowerCase();
  if (/\b(gold|xau)\b/.test(s)) return 'gold';
  if (/\b(btc|bitcoin)\b/.test(s)) return 'btc';
  return 'forex';
}
// $ per pip per 1.0 (standard) lot.
function pipValuePerStandardLot(instrument) {
  if (instrument === 'gold') return 10;     // $10/pip/std lot
  if (instrument === 'btc')  return null;   // varies by broker — don't guess
  return 10;                                // FX majors (USD quote)
}
const CONTRACT = { gold: 100, forex: 100000, btc: 1 };

const r2 = (n) => Math.round(n * 100) / 100;

// ── PURE COMPUTE ──────────────────────────────────────────────────────────────
export function calcLotSize({ balance, riskPct, slPips, instrument = 'forex' }) {
  const pv = pipValuePerStandardLot(instrument);
  if (!pv || !balance || !riskPct || !slPips) return null;
  const riskAmount = balance * (riskPct / 100);
  const lots = riskAmount / (slPips * pv);
  return { riskAmount: r2(riskAmount), pipValue: pv, lots: r2(lots), instrument };
}
export function calcRiskReward({ slPips, tpPips }) {
  if (!slPips || !tpPips) return null;
  return { ratio: r2(tpPips / slPips), slPips, tpPips };
}
export function calcPipValue({ lots, instrument = 'forex' }) {
  const pv = pipValuePerStandardLot(instrument);
  if (!pv || !lots) return null;
  return { perPip: r2(lots * pv), lots, instrument };
}
export function calcProfitLoss({ lots, pips, instrument = 'forex' }) {
  const pv = pipValuePerStandardLot(instrument);
  if (!pv || lots == null || pips == null) return null;
  return { amount: r2(pips * pv * lots), lots, pips, instrument };
}

// ── PARSE a calculation request from natural text ─────────────────────────────
function num(re, s) { const m = s.match(re); return m ? parseFloat((m[1] || m[2] || '').replace(/,/g, '')) : null; }

export function detectCalcRequest(text) {
  const s = String(text || '').toLowerCase();
  const instrument = instrumentOf(s);
  const balance = num(/(?:\$|balance|account|capital|have|deposit)\D{0,6}([\d,]+(?:\.\d+)?)/, s) || num(/([\d,]{3,}(?:\.\d+)?)\s*(?:dollars|usd|\$)/, s);
  const riskPct = num(/([\d.]+)\s*%/, s) || num(/risk\D{0,6}([\d.]+)\s*(?:percent|%)/, s);
  const slPips  = num(/(?:stop\s*loss|sl|stop)\D{0,6}([\d.]+)\s*pip/, s) || num(/([\d.]+)\s*pip\s*(?:stop|sl)/, s) || num(/(?:stop\s*loss|sl)\D{0,6}([\d.]+)/, s);
  const tpPips  = num(/(?:take\s*profit|tp|target)\D{0,6}([\d.]+)\s*pip/, s) || num(/([\d.]+)\s*pip\s*(?:take\s*profit|tp|target)/, s) || num(/(?:take\s*profit|tp)\D{0,6}([\d.]+)/, s);

  const wantsLot = /\b(lot size|position size|how (many|much) lots?|what lot|calculate.*lot|size my (trade|position))\b/.test(s);
  const wantsRR  = /\b(risk(?:[ /:-]| to )?reward|r\s*[:/]\s*r|reward ratio)\b/.test(s);
  const wantsPip = /\b(pip value|value of a pip|how much.*pip|per pip)\b/.test(s);

  if (wantsLot && balance && riskPct && slPips) return { type: 'lotsize', ready: true, inputs: { balance, riskPct, slPips, instrument } };
  if (wantsRR && slPips && tpPips)              return { type: 'riskreward', ready: true, inputs: { slPips, tpPips } };
  if (wantsPip && instrument !== 'btc')         return { type: 'pipvalue', ready: true, inputs: { lots: num(/([\d.]+)\s*lot/, s) || 1, instrument } };
  // Wanted a calc but missing inputs → signal so the engine can ask (not hallucinate).
  if (wantsLot || wantsRR || wantsPip)          return { type: wantsLot ? 'lotsize' : wantsRR ? 'riskreward' : 'pipvalue', ready: false, inputs: { balance, riskPct, slPips, tpPips, instrument } };
  return { type: null, ready: false };
}

// ── FORMAT (localized labels; calculation shown) ──────────────────────────────
const L = {
  lotsize: {
    en: r => `📐 **Lot size**\n• Account: $${r.in.balance.toLocaleString()} · Risk: ${r.in.riskPct}% = **$${r.riskAmount}**\n• Stop: ${r.in.slPips} pips · ${cap(r.instrument)} pip value: ~$${r.pipValue}/pip per 1.0 lot\n• **Lot size = $${r.riskAmount} ÷ (${r.in.slPips} × $${r.pipValue}) = \`${r.lots}\` lots**\n\n_⚠️ Educational — verify pip value on your platform; never risk more than 1–2%._`,
    ur: r => `📐 **Lot size**\n• اکاؤنٹ: $${r.in.balance.toLocaleString()} · رسک: ${r.in.riskPct}% = **$${r.riskAmount}**\n• Stop: ${r.in.slPips} pips · ${cap(r.instrument)} pip value: ~$${r.pipValue}\n• **Lot size = $${r.riskAmount} ÷ (${r.in.slPips} × $${r.pipValue}) = \`${r.lots}\` lots**\n\n_⚠️ تعلیمی — اپنے platform پر pip value چیک کریں؛ 1–2% سے زیادہ رسک نہ کریں۔_`,
    'ur-roman': r => `📐 **Lot size**\n• Account: $${r.in.balance.toLocaleString()} · Risk: ${r.in.riskPct}% = **$${r.riskAmount}**\n• Stop: ${r.in.slPips} pips · ${cap(r.instrument)} pip value: ~$${r.pipValue}\n• **Lot size = $${r.riskAmount} ÷ (${r.in.slPips} × $${r.pipValue}) = \`${r.lots}\` lots**\n\n_⚠️ Taleemi — apne platform par pip value check karein; 1–2% se zyada risk na karein._`,
    ar: r => `📐 **حجم العقد (Lot)**\n• الحساب: $${r.in.balance.toLocaleString()} · المخاطرة: ${r.in.riskPct}% = **$${r.riskAmount}**\n• الوقف: ${r.in.slPips} نقطة · قيمة النقطة لـ${cap(r.instrument)}: ~$${r.pipValue}\n• **اللوت = $${r.riskAmount} ÷ (${r.in.slPips} × $${r.pipValue}) = \`${r.lots}\` لوت**\n\n_⚠️ تعليمي — تحقق من قيمة النقطة على منصتك؛ لا تخاطر بأكثر من 1–2%._`,
  },
  riskreward: {
    en: r => `📐 **Risk-to-Reward**\n• Stop: ${r.slPips} pips · Target: ${r.tpPips} pips\n• **R:R = ${r.tpPips} ÷ ${r.slPips} = \`1:${r.ratio}\`**\n\n_${r.ratio >= 1.5 ? '✅ A healthy ratio — you can be right under half the time and still profit.' : '⚠️ Below 1:1.5 — consider a wider target or tighter stop.'}_`,
    ur: r => `📐 **Risk-to-Reward**\n• Stop: ${r.slPips} pips · Target: ${r.tpPips} pips\n• **R:R = ${r.tpPips} ÷ ${r.slPips} = \`1:${r.ratio}\`**`,
    'ur-roman': r => `📐 **Risk-to-Reward**\n• Stop: ${r.slPips} pips · Target: ${r.tpPips} pips\n• **R:R = ${r.tpPips} ÷ ${r.slPips} = \`1:${r.ratio}\`**`,
    ar: r => `📐 **المخاطرة للعائد**\n• الوقف: ${r.slPips} · الهدف: ${r.tpPips}\n• **R:R = ${r.tpPips} ÷ ${r.slPips} = \`1:${r.ratio}\`**`,
  },
  pipvalue: {
    en: r => `📐 **Pip value**\n• ${r.lots} lot(s) of ${cap(r.instrument)} ≈ **$${r.perPip} per pip**.\n\n_⚠️ Educational — confirm on your broker; values differ for some instruments._`,
    ur: r => `📐 **Pip value**\n• ${cap(r.instrument)} کے ${r.lots} lot ≈ **$${r.perPip} فی pip**۔`,
    'ur-roman': r => `📐 **Pip value**\n• ${cap(r.instrument)} ke ${r.lots} lot ≈ **$${r.perPip} per pip**.`,
    ar: r => `📐 **قيمة النقطة**\n• ${r.lots} لوت من ${cap(r.instrument)} ≈ **$${r.perPip} لكل نقطة**.`,
  },
};
function cap(s) { return String(s || '').replace(/^./, c => c.toUpperCase()); }

// Compute + format in one call. Returns a string, or '' if not ready / not a calc.
export function runCalculator(detect, lang = 'en') {
  if (!detect || !detect.ready) return '';
  const i = detect.inputs;
  if (detect.type === 'lotsize') {
    const r = calcLotSize(i); if (!r) return '';
    return (L.lotsize[lang] || L.lotsize.en)({ ...r, in: i });
  }
  if (detect.type === 'riskreward') {
    const r = calcRiskReward(i); if (!r) return '';
    return (L.riskreward[lang] || L.riskreward.en)(r);
  }
  if (detect.type === 'pipvalue') {
    const r = calcPipValue(i); if (!r) return '';
    return (L.pipvalue[lang] || L.pipvalue.en)(r);
  }
  return '';
}

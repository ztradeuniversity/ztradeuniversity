// functions/utils/trade-rescue/levels.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU RESCUE — VERIFIED RANGE + DEFENSIBLE INVALIDATION
//
// A conditional Stop Loss / invalidation level is only ever proposed from a
// number that actually came from a data provider — never invented, never
// rounded to "look right", never padded with a made-up buffer.
//
// The one level this system can defend is the boundary of the VERIFIED recent
// trading range: the highest and lowest CLOSE over the daily candles
// /api/market-history actually returned. That is not a chart pattern and not a
// claim about "real" support/resistance — it is reported as exactly what it is,
// a realised range over N verified sessions, which is the same basis the
// technical evidence meter already uses (see meters.js technicalMeter).
//
// A level only becomes a candidate invalidation when it sits on the side of
// current price where breaching it would actually falsify the position's
// direction. For a SELL that is the range HIGH (price breaking above it means
// the short thesis is wrong); for a BUY it is the range LOW. If the candidate
// is not on that side — e.g. price is already beyond it — nothing is proposed.
// ════════════════════════════════════════════════════════════════════════════

const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** The verified high/low over a set of candle closes. Null with too little data. */
export function computeVerifiedRange(closes) {
  const c = (closes || []).filter((v) => Number.isFinite(v));
  if (c.length < 5) return null;
  return { high: round(Math.max(...c)), low: round(Math.min(...c)), sessions: c.length };
}

/**
 * A defensible invalidation candidate, or null with a stated reason.
 *
 * @param {'buy'|'sell'} direction
 * @param {number} price      verified current price
 * @param {{high:number, low:number, sessions:number}|null} range
 * @returns {{ok:true, level:number, side:'above'|'below', sessions:number} | {ok:false, reason:string}}
 */
// Every refusal also carries a `reasonCode` + `reasonVars` — a stable,
// language-neutral identifier for WHICH of the four refusal cases fired, plus
// the numbers involved. `reason` (English prose) is unchanged for any existing
// caller; the code/vars pair exists purely so a caller that wants the same
// refusal in another language (see result-i18n.js) can render it without
// parsing the English sentence.
export function defensibleInvalidation(direction, price, range) {
  if (!range) return { ok: false, reason: 'No verified trading range is available for this instrument.', reasonCode: 'no_range', reasonVars: {} };
  if (!Number.isFinite(price)) return { ok: false, reason: 'No verified current price to measure the range against.', reasonCode: 'no_price', reasonVars: {} };

  if (direction === 'sell') {
    if (range.high <= price) return { ok: false, reason: `The verified range high (${range.high}) is not above the current price (${price}), so it cannot serve as an invalidation level for a short.`, reasonCode: 'wrong_side_sell', reasonVars: { level: range.high, price } };
    return { ok: true, level: range.high, side: 'above', sessions: range.sessions };
  }
  if (direction === 'buy') {
    if (range.low >= price) return { ok: false, reason: `The verified range low (${range.low}) is not below the current price (${price}), so it cannot serve as an invalidation level for a long.`, reasonCode: 'wrong_side_buy', reasonVars: { level: range.low, price } };
    return { ok: true, level: range.low, side: 'below', sessions: range.sessions };
  }
  return { ok: false, reason: 'Direction is not established, so an invalidation level cannot be proposed.', reasonCode: 'no_direction', reasonVars: {} };
}

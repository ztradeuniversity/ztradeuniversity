// functions/utils/trade-rescue/position.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU RESCUE — POSITION STRUCTURE MATHEMATICS
//
// A stuck trade is rarely one order. It is usually a first entry, one or two
// additions, and sometimes a hedge in the opposite direction — and the trader's
// real question ("where does this book actually stand?") cannot be answered by
// looking at any single layer.
//
// Everything here is ARITHMETIC on numbers the trader supplied plus one verified
// current price. Nothing is estimated, nothing is fetched, and no market view is
// formed. Every output is tagged DERIVED so the report can never present a
// computed figure as something the trader stated or the market confirmed.
//
// CONTRACT SIZE is the one convention that cannot be derived: a "lot" means
// whatever the trader's broker says it means. The defaults below are the common
// retail conventions, they are declared openly in `assumptions`, and the caller
// can override them. Money figures are omitted entirely when no contract size
// is known — points are always exact, money never guessed.
// ════════════════════════════════════════════════════════════════════════════

export const PROVENANCE = {
  USER: 'USER_PROVIDED',
  VERIFIED: 'VERIFIED_EXTERNAL',
  DERIVED: 'DERIVED',
  UNAVAILABLE: 'UNAVAILABLE',
};

// Units per 1.00 lot, by instrument. Retail conventions, stated not assumed
// silently — the report prints them and the trader can correct them.
export const CONTRACT_UNITS = {
  'XAU/USD': { units: 100, label: '100 oz per 1.00 lot' },
  'BTC/USD': { units: 1, label: '1 BTC per 1.00 lot' },
};

// Number(null) is 0 and Number('') is 0, so an absent value has to be rejected
// BEFORE coercion — otherwise a missing contract size silently becomes zero.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Normalise one user-supplied layer. Anything unparseable becomes null rather
 * than a guess — a layer with no entry still counts structurally, it simply
 * cannot contribute to the arithmetic.
 */
export function normalizeLayer(raw, i = 0) {
  const dir = String(raw?.direction || '').toLowerCase();
  return {
    id: raw?.id || `L${i + 1}`,
    direction: dir === 'buy' || dir === 'sell' ? dir : null,
    entry: num(raw?.entry),
    size: num(raw?.size),
    opened_at: raw?.opened_at ? String(raw.opened_at).slice(0, 32) : null,
    stop_loss: num(raw?.stop_loss),
    take_profit: num(raw?.take_profit),
    note: raw?.note ? String(raw.note).slice(0, 200) : null,
    purpose: raw?.purpose ? String(raw.purpose).slice(0, 40) : null,   // e.g. "hedge"
  };
}

export function normalizeLayers(list) {
  return (Array.isArray(list) ? list : []).slice(0, 20).map(normalizeLayer)
    .filter(l => l.direction || l.entry != null);
}

/** A layer enters the arithmetic once it has a side and a price. Size is
    optional: when it is absent every layer carries equal weight. */
const computable = (l) => !!l.direction && l.entry != null;
const weightOf = (l) => (l.size != null && l.size > 0 ? l.size : 1);

/**
 * Aggregate a set of layers against one verified current price.
 *
 * @param {object[]} layers        normalised layers
 * @param {string}   instrument    canonical id, for the contract convention
 * @param {number|null} currentPrice  VERIFIED price, or null when unavailable
 * @param {number|null} unitsOverride trader's own units-per-lot, if supplied
 */
export function analyzePosition(layers, instrument, currentPrice, unitsOverride = null) {
  const L = (layers || []).map((l, i) => (l.id ? l : normalizeLayer(l, i)));
  const usable = L.filter(computable);
  const conv = CONTRACT_UNITS[instrument] || null;
  // Money requires BOTH a contract convention and real sizes. Without sizes the
  // weights are relative, so a currency figure would be fiction.
  const sized = usable.length > 0 && usable.every(l => l.size != null && l.size > 0);
  const units = sized ? (num(unitsOverride) ?? (conv ? conv.units : null)) : null;
  const unitWord = sized ? 'lots' : 'units';

  const out = {
    provenance: PROVENANCE.DERIVED,
    layerCount: L.length,
    computableCount: usable.length,
    incomplete: L.length - usable.length,
    assumptions: [],
    grossLongSize: 0,
    grossShortSize: 0,
    netSize: 0,                 // + = net long, − = net short
    netDirection: null,         // 'buy' | 'sell' | 'flat'
    avgLongEntry: null,
    avgShortEntry: null,
    breakevenPrice: null,       // price at which the whole book is flat
    hedgeRatio: null,           // 0 = unhedged, 1 = fully hedged
    hedged: false,
    perLayer: [],
    floatingPoints: null,       // Σ weight × signed price distance
    sized: false,               // true only when real lot sizes were supplied
    floatingMoney: null,        // only when a contract size is known
    currentPrice: currentPrice ?? null,
    priceStatus: currentPrice == null ? PROVENANCE.UNAVAILABLE : PROVENANCE.VERIFIED,
    worstLayer: null,
    bestLayer: null,
    layersWithoutStop: 0,
    notes: [],
  };

  out.sized = sized;
  if (!usable.length) {
    out.notes.push('No layer carried both a side and an entry price, so position arithmetic could not be performed.');
    return out;
  }

  if (units != null) {
    out.assumptions.push(`Contract size: ${conv.label} (standard retail convention — correct it if your broker differs).`);
  } else if (!sized) {
    out.notes.push('No position sizes were supplied, so every layer is weighted equally. Direction and which layer helps or hurts are unaffected; a money figure is not produced, because relative weights cannot support one.');
  } else {
    out.notes.push('No contract size is known for this instrument, so results stay in price points and are never converted to money.');
  }

  let sumSigned = 0, sumSignedEntry = 0;
  let longSizeEntry = 0, shortSizeEntry = 0;

  for (const l of usable) {
    const sign = l.direction === 'buy' ? 1 : -1;
    const w = weightOf(l);
    if (sign > 0) { out.grossLongSize += w; longSizeEntry += w * l.entry; }
    else { out.grossShortSize += w; shortSizeEntry += w * l.entry; }
    sumSigned += sign * w;
    sumSignedEntry += sign * w * l.entry;
    if (l.stop_loss == null) out.layersWithoutStop += 1;

    const row = {
      id: l.id, direction: l.direction, entry: l.entry, size: l.size, weight: weightOf(l),
      opened_at: l.opened_at, purpose: l.purpose,
      distance: null, points: null, money: null, helping: null,
    };
    if (currentPrice != null) {
      // Signed distance in the trader's favour.
      row.distance = round(sign * (currentPrice - l.entry), 4);
      row.points = round(row.distance * weightOf(l), 4);
      if (units != null) row.money = round(row.distance * weightOf(l) * units, 2);
      row.helping = row.distance > 0 ? true : row.distance < 0 ? false : null;
    }
    out.perLayer.push(row);
  }

  out.grossLongSize = round(out.grossLongSize, 4);
  out.grossShortSize = round(out.grossShortSize, 4);
  out.netSize = round(sumSigned, 4);
  out.netDirection = out.netSize > 0 ? 'buy' : out.netSize < 0 ? 'sell' : 'flat';
  out.avgLongEntry = out.grossLongSize > 0 ? round(longSizeEntry / out.grossLongSize, 4) : null;
  out.avgShortEntry = out.grossShortSize > 0 ? round(shortSizeEntry / out.grossShortSize, 4) : null;

  const gl = out.grossLongSize, gs = out.grossShortSize;
  if (gl > 0 && gs > 0) {
    out.hedged = true;
    out.hedgeRatio = round(Math.min(gl, gs) / Math.max(gl, gs), 3);
  } else out.hedgeRatio = 0;

  // Breakeven: the price P where Σ signᵢ·sizeᵢ·(P − entryᵢ) = 0.
  // Undefined for a perfectly hedged book, where P/L no longer moves with price.
  if (Math.abs(sumSigned) > 1e-9) out.breakevenPrice = round(sumSignedEntry / sumSigned, 4);
  else out.notes.push('Long and short size are equal, so the book is delta-flat: further price movement no longer changes the aggregate result.');

  if (currentPrice != null) {
    out.floatingPoints = round(out.perLayer.reduce((a, r) => a + (r.points || 0), 0), 4);
    if (units != null) out.floatingMoney = round(out.perLayer.reduce((a, r) => a + (r.money || 0), 0), 2);
    const scored = out.perLayer.filter(r => r.points != null);
    if (scored.length) {
      out.worstLayer = scored.reduce((a, b) => (b.points < a.points ? b : a));
      out.bestLayer = scored.reduce((a, b) => (b.points > a.points ? b : a));
    }
  }

  if (out.incomplete > 0) {
    out.notes.push(`${out.incomplete} layer(s) were left out of the arithmetic because they did not carry both a side and an entry price.`);
  }
  return out;
}

/**
 * The single-entry Trade Case the EXISTING analysis engine already understands,
 * synthesised from the aggregate book. This is what lets every existing layer
 * (technical, fundamental, news, sentiment, risk, behaviour, scenarios) run
 * unchanged over a multi-layer position instead of being rewritten for it.
 */
export function aggregateToCase(pos, base) {
  const c = { ...base };
  if (pos.netDirection && pos.netDirection !== 'flat') c.direction = pos.netDirection;
  // The breakeven price IS the effective entry of the combined book.
  if (pos.breakevenPrice != null) c.entry = pos.breakevenPrice;
  else if (pos.netDirection === 'buy' && pos.avgLongEntry != null) c.entry = pos.avgLongEntry;
  else if (pos.netDirection === 'sell' && pos.avgShortEntry != null) c.entry = pos.avgShortEntry;

  if (pos.layersWithoutStop > 0 && pos.computableCount > 0 && pos.layersWithoutStop === pos.computableCount) {
    c.has_stop_loss = false;
  }
  if (pos.floatingPoints != null) {
    c.floating_state = pos.floatingPoints > 0 ? 'profit' : pos.floatingPoints < 0 ? 'loss' : 'breakeven';
  }
  if (pos.netSize != null) {
    c.position_size = `${Math.abs(pos.netSize)} ${pos.sized ? 'lots' : 'equally weighted units'} net${pos.hedged ? ` (${pos.grossLongSize} long / ${pos.grossShortSize} short)` : ''}`;
  }
  return c;
}

/** Human-readable position lines for the evidence brief. All DERIVED.
 *  `includeBreakeven` defaults to true for internal/API callers that want the
 *  full picture; the results page deliberately renders with it OFF, since
 *  break-even is a computation aid, not something a trader asked for as a
 *  headline figure — it stays available on `pos.breakevenPrice` either way. */
export function positionLines(pos, instrument, { includeBreakeven = true } = {}) {
  const L = [];
  if (!pos || !pos.computableCount) return L;
  L.push(`Layers supplied: ${pos.layerCount} (${pos.computableCount} complete enough to compute).`);
  const U = pos.sized ? 'lots' : 'equally weighted units';
  if (pos.grossLongSize) L.push(`Gross long ${pos.grossLongSize} ${U}, weighted average entry ${pos.avgLongEntry}.`);
  if (pos.grossShortSize) L.push(`Gross short ${pos.grossShortSize} ${U}, weighted average entry ${pos.avgShortEntry}.`);
  L.push(`Net exposure ${Math.abs(pos.netSize)} ${U} ${pos.netDirection === 'flat' ? '(delta-flat)' : pos.netDirection.toUpperCase()}.`);
  if (pos.hedged) L.push(`Hedged: ${Math.round(pos.hedgeRatio * 100)}% of the larger side is offset by the opposite side.`);
  if (includeBreakeven && pos.breakevenPrice != null) L.push(`Aggregate breakeven price ${pos.breakevenPrice} (DERIVED from the layers above).`);
  if (pos.floatingPoints != null) {
    L.push(`Aggregate floating result ${pos.floatingPoints} ${pos.sized ? 'lot-points' : 'weighted points'}${pos.floatingMoney != null ? ` (≈ ${pos.floatingMoney} account currency)` : ''} at the current verified price ${pos.currentPrice} — DERIVED, not broker-confirmed.`);
  }
  const PT = pos.sized ? 'lot-points' : 'weighted points';
  if (pos.worstLayer) L.push(`Worst layer ${pos.worstLayer.id}: ${pos.worstLayer.direction.toUpperCase()} @ ${pos.worstLayer.entry}, ${pos.worstLayer.points} ${PT}.`);
  if (pos.bestLayer && pos.bestLayer.id !== pos.worstLayer?.id) L.push(`Best layer ${pos.bestLayer.id}: ${pos.bestLayer.direction.toUpperCase()} @ ${pos.bestLayer.entry}, ${pos.bestLayer.points} ${PT}.`);
  if (pos.layersWithoutStop) L.push(`${pos.layersWithoutStop} of ${pos.computableCount} layer(s) carry no Stop Loss.`);
  for (const a of pos.assumptions) L.push(`Assumption stated to the trader: ${a}`);
  for (const n of pos.notes) L.push(n);
  return L;
}

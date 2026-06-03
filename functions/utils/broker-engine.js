// functions/utils/broker-engine.js
// ════════════════════════════════════════════════════════════════════════════
// BROKER EXPERT SPECIALIST — regulated-status, account types, deposits/
// withdrawals, platforms, strengths/weaknesses, common complaints, and beginner
// suitability. Answer depth (short / medium / detailed) follows trader level.
// Official sources only — never review/blog sites. No signals.
// ════════════════════════════════════════════════════════════════════════════

import { brokerRegulatorLines, listBrokerNames, REGULATORS, getBrokerProfile } from './broker-data.js';
import { has } from './response-engine.js';

function depthFromLevel(level) {
  if (level === 'beginner') return 'short';
  if (level === 'advanced') return 'detailed';
  return 'medium';
}

export function buildBrokerResponse(ctx) {
  const text   = ctx.text || '';
  const broker = ctx.broker;
  const s      = text.toLowerCase();
  const depth  = depthFromLevel(ctx.traderContext?.level);

  // Specific broker named → profile card (depth-aware)
  if (broker) {
    const prof = getBrokerProfile(broker.key);
    let out = `## ${broker.name}\n`;
    out += `**Account types:** ${broker.accountTypes.join(', ')}\n\n`;
    out += `**Regulation (per the broker's disclosures — always verify yourself):**\n${brokerRegulatorLines(broker).join('\n')}\n\n`;

    if (prof) {
      if (prof.platforms) out += `**Platforms:** ${prof.platforms.join(', ')}\n`;
      if (prof.beginner)  out += `**Beginner suitability:** ${prof.beginner}\n`;

      if (depth !== 'short') {
        if (prof.deposit)        out += `\n**Deposit methods:** ${prof.deposit.join(', ')}\n`;
        if (prof.withdrawal)     out += `**Withdrawal methods:** ${prof.withdrawal.join(', ')}\n`;
        if (prof.withdrawalTime) out += `**Typical withdrawal time:** ${prof.withdrawalTime}\n`;
      }
      if (depth === 'detailed') {
        if (prof.strengths)  out += `\n**Strengths:**\n${prof.strengths.map(x => `- ${x}`).join('\n')}\n`;
        if (prof.weaknesses) out += `\n**Weaknesses:**\n${prof.weaknesses.map(x => `- ${x}`).join('\n')}\n`;
        if (prof.complaints) out += `\n**Common trader complaints:**\n${prof.complaints.map(x => `- ${x}`).join('\n')}\n`;
      }
    }

    out += `\n**Official links (only official sources):**\n- Website: ${broker.website}\n- Help center: ${broker.help}\n`;
    if (broker.notes) out += `\n**Notes:** ${broker.notes}\n`;

    // Issue-specific guidance
    if (has(s, ['deposit', 'pending'])) {
      out += `\n**Deposit pending?** Processing times vary by method (cards/e-wallets are usually fast; bank wires take longer). Check the deposit status in your broker portal and contact the broker's **official help center** above if it exceeds their stated time.\n`;
    }
    if (has(s, ['withdraw', 'withdrawal'])) {
      out += `\n**Withdrawal delayed?** Most delays are due to **KYC/verification** not being complete, or withdrawing to a different method than you deposited with. Verify your KYC status and raise a ticket via the official help center.\n`;
    }
    if (has(s, ['login', 'invalid account', 'invalid server', "can't login", 'cannot login', 'mt5 login'])) {
      out += `\n**MT5 login / "invalid account"?** Re-check your **login number**, **password**, and the exact **server name** (it must match what the broker emailed you). Picking the wrong server is the #1 cause of this error.\n`;
    }
    out += `\n_⚠️ I share official broker info only and never your password. Always confirm regulation on the official register links above._`;
    return out;
  }

  // Regulation / "is it legal" / how to verify
  if (has(s, ['regulated', 'regulation', 'legal', 'verify', 'fca', 'cysec', 'asic', 'fsca'])) {
    const regList = Object.values(REGULATORS).map(r => `- **${r.name}** — ${r.verify}`).join('\n');
    return `## How to Verify a Broker's Regulation\n` +
      `Never trust a broker's word alone — **check the regulator's official register** directly:\n\n${regList}\n\n` +
      `Steps: 1) Find the broker's claimed licence number on their site, 2) search it on the matching regulator register above, 3) confirm the legal entity name and that the licence is **active**.\n\n` +
      `Brokers I have detailed info on: ${listBrokerNames().join(', ')}. Name one for its regulators and account types.`;
  }

  // Account types / spreads / leverage explainer
  if (has(s, ['account type', 'raw vs standard', 'standard vs', 'ecn', 'cent account', 'which account'])) {
    return `## Broker Account Types — Explained\n` +
      `- **Cent / Micro:** balances shown in cents; tiny position sizes. Best for **learning** or very small capital.\n` +
      `- **Standard:** commission-free, cost is in the (slightly wider) **spread**. Good all-rounder for most retail traders.\n` +
      `- **ECN / Raw / Zero:** **raw spreads + a commission** per lot. Tightest spreads — best for active traders/scalpers who calculate total cost.\n` +
      `- **Pro / VIP:** for larger accounts; better conditions, sometimes higher minimums.\n\n` +
      `**Total cost = spread + commission.** A "zero spread" account with commission can be cheaper or pricier than a standard account depending on how you trade — compare the all-in cost.\n\n` +
      `Tell me your broker (e.g., ${listBrokerNames().slice(0, 4).join(', ')}…) and I'll list its specific account types.`;
  }

  if (has(s, ['spread', 'commission'])) {
    return `## Spreads vs. Commission\n` +
      `- **Spread:** the gap between Bid and Ask — your immediate cost to enter. Standard accounts bake cost into a wider spread.\n` +
      `- **Commission:** a flat fee per lot on raw/ECN accounts, which have much tighter spreads.\n` +
      `- **Compare all-in:** raw spread + commission vs. standard spread. For frequent/scalping styles, raw+commission is often cheaper.\n` +
      `- **Swap/overnight fees** also apply if you hold positions past the daily rollover.`;
  }

  if (has(s, ['leverage'])) {
    return `## Leverage — Explained\n` +
      `Leverage lets you control a larger position with less margin (e.g., 1:100 means $1,000 controls $100,000).\n\n` +
      `⚠️ **Leverage amplifies both gains AND losses.** It does **not** change your risk per trade — that's set by your **stop loss and position size**. Many blown accounts come from oversizing because high leverage *allowed* it.\n\n` +
      `Rule of thumb: decide risk by the **1–2% rule**, not by how much leverage your broker offers.`;
  }

  if (has(s, ['margin'])) {
    return `## Margin — Explained\n` +
      `- **Used Margin:** the funds locked to hold your open positions.\n` +
      `- **Free Margin:** Equity − Used Margin — what's available for new trades or to absorb drawdown.\n` +
      `- **Margin Level (%):** (Equity ÷ Used Margin) × 100. If it falls too low, you hit a **margin call** and then a **stop-out** (positions auto-closed).\n\n` +
      `Keeping plenty of free margin (by not oversizing) is how you avoid forced liquidations.`;
  }

  // Generic broker help
  return `## Broker Help\n` +
    `I can help with **account types**, **regulation checks**, **deposits/withdrawals**, **MT5 login issues**, **spreads/commission**, **leverage**, and **margin**.\n\n` +
    `Brokers I have detailed official info on: **${listBrokerNames().join(', ')}**.\n\n` +
    `Ask me something like *"Is IC Markets regulated?"*, *"Exness withdrawal delayed"*, or *"Raw vs Standard account?"*`;
}

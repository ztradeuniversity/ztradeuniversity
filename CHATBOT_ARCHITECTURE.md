# ZTU AI Trading Assistant — Chatbot Architecture

> **Audience:** a developer new to this codebase who needs to understand the chatbot
> end-to-end without reading thousands of lines. This document is descriptive of the
> code as it actually is (verified against source), not aspirational.

---

## 1. Overall Architecture

The chatbot is a **serverless, graph-grounded trading education assistant**. There is no
monolithic AI service — everything runs as Cloudflare Pages Functions plus a large set
of pure JavaScript utility modules.

```
Browser (ai-trade-assistant.html)
        │  POST /api/ai-chat  (SSE stream)
        ▼
functions/api/ai-chat.js   ← THE hot-path orchestrator (~1800 lines, ~60 imports)
        │
        ├─ language detection + intent classification   (intent-engine.js)
        ├─ conversation recovery / slang / multilang     (recovery-engine, slang-normalizer, lang-assist)
        ├─ cognition → confidence → clarification        (question-cognition, confidence-engine)
        ├─ EXECUTION CONTEXT (routing config)            (buildExecutionContext + site-settings)
        ├─ retrieval + answer production                 (graph-retrieval, article-knowledge, market-*, composer-llm)
        ├─ single-reply composition                      (composer.js  ← optional LLM rephrase)
        ├─ response optimizer (length + chips)           (response-optimizer.js)
        └─ SSE stream out (answer + source badge + chips)
```

**Core principle:** the **Knowledge Graph is the source of truth** for facts. The LLM
(when configured) only *rephrases an already-grounded draft* — it is never allowed to
invent facts. Every layer degrades gracefully: if Supabase / the graph / the LLM / the
market API is unavailable, the pipeline still returns a safe, honest answer.

**Key files:**
| Concern | File |
|---|---|
| Hot-path orchestrator | `functions/api/ai-chat.js` |
| Intent + language detection | `functions/utils/intent-engine.js` |
| Confidence + clarification | `functions/utils/confidence-engine.js` |
| Rule-engine answers | `functions/utils/specialist-router.js` → `market-engine.js`, `knowledge-engine.js`, `psychology-engine.js`, … |
| Graph retrieval | `functions/utils/graph-retrieval.js`, `semantic-retrieval.js`, `retrieval-lexicon.js` |
| LLM composer / generator | `functions/utils/composer.js`, `composer-llm.js` |
| Response optimizer | `functions/utils/response-optimizer.js` |
| Source badge / routing labels | `functions/utils/answer-source.js` |
| Access / session tokens | `functions/api/ai-access.js`, `functions/utils/identity-session.js` |
| Client UI | `ai-trade-assistant.html` |
| Admin routing + preview | `admin/pages/content-center.html`, `admin/js/content-center.js` |

---

## 2. Chat Request Flow

1. **Client** (`ai-trade-assistant.html`) sends `POST /api/ai-chat` with
   `{ messages, userId, identityToken, traderContext, sessionLang, uiLang, … }` and reads
   back a **Server-Sent-Events (SSE)** stream (`data: {t}` token deltas, plus `{source}`,
   `{suggestions}`, `{actions}` events).
2. **Parallel fetch** (best-effort, `Promise.allSettled`): live market sentiment, user
   memory, pattern context, **and the persisted routing config** (`chatbot_routing`).
   All run concurrently so routing adds zero latency.
3. **Normalize** the last user message: recovery (typos/fragments) → indirect
   understanding → slang → multilang → **language detection** (sets the reply language —
   the "Language Lock").
4. **Access gating**: `resolveTier()` (see §3). Guests get N free messages; verified
   users are `unlimited`. Admin-diagnostic calls bypass the guest limit.
5. **Execution context**: `buildExecutionContext()` turns the routing config into
   `ctx = { database, graph, live, calc, openai }` booleans (see §6).
6. **Cognition → confidence → clarification** (see §8, §9). If the question is too vague,
   a single clarification question short-circuits the rest.
7. **Answer production**, in intent-aware order (see §6/§10): live-market / calculator
   (`directAnswer`) → knowledge graph (`kbAnswer`) → database article → OpenAI generation
   → rule-engine baseline → safe reply. Each gated by its `ctx.<source>` flag.
8. **Composition**: `composeAnswer()` assembles one coherent reply (lead + body +
   contradiction + engagement + one disclaimer). If OpenAI is enabled and bound, the
   grounded draft is rephrased into human prose; otherwise the rule assembler is used.
9. **Response optimizer**: length cap + tight follow-up chips (see §12).
10. **Global footer** (Telegram/WhatsApp contact) + **source badge** + **analytics log**.
11. **Stream out** over SSE.

---

## 3. Authentication Flow

Authentication is **borrowed wholesale from the Library system** — the chatbot adds no
new OTP, email, or eligibility logic.

- **Endpoint:** `functions/api/ai-access.js` is a thin proxy over the untouched
  `functions/api/library-auth.js`.
- **Token:** on successful OTP verification, `ai-access` mints a **stateless,
  HMAC-signed gating token** (`identity-session.js::signSession`) carrying
  `{ acct, tier:'unlimited', exp, elig_exp, ss }`. Signed with `LIBRARY_OTP_SECRET`
  (the *same* secret the Library already uses — **no new secret**).
- **No PII in the token.** No per-chat DB hit: `ai-chat` trusts the signed tier.
- **Tiers:** `visitor` (guest, limited free messages) and `unlimited` (verified).
- **Shared session:** the AI page and `library.html` share `localStorage` on the same
  origin. A Library login is inherited by the chatbot (and vice-versa) via the
  `bridge` action — no second OTP.

### Session lifetimes (important)
| Constant | Value | Meaning |
|---|---|---|
| `SESSION_TTL_MS` (`ai-access.js`) | **15 days** | Hard token expiry, == Library session |
| `ELIG_TTL_MS` | **24 hours** | Eligibility re-check window (NOT an OTP window) |
| `LIB_SESSION_TTL` (client) | **15 days** | Shared Library session hard expiry |

The **48-hour "persistent login"** requirement is comfortably satisfied — the token
already lasts 15 days and is restored from `localStorage` on every page load.

---

## 4. OTP Verification Flow

Handled entirely by `library-auth.js` (never modified by the chatbot). `ai-access.js`
proxies it:

```
request  { account }            → library-auth request-otp  → { otpToken, email_mask }
verify   { otpToken, code }     → library-auth verify-otp   → mint AI gating token
resend   { otpToken }           → library-auth resend-otp   (60s cooldown enforced by Library)
```

- Account-state reasons (`not_found`, `inactive`, `email_missing`, …) map to localized
  messages via `access-copy.js`.
- OTP token carries an **attempt counter** (`att`); Library decrements it on each wrong
  code and enforces expiry — the chatbot layer changes none of this.

---

## 5. IB Verification Flow

Eligibility is an **IB Stars / Special-Access** lookup, owned by Library
(`library-auth.js::lookupIbStars`):

1. **Path 1 — IB Stars Active** (`broker_accounts` table): found + active + has email → grant.
2. **Path 2 — Special Access** (`special_access` table): fallback grant if Path 1 misses.

`verify-session { account }` re-runs this lookup and returns `{ ok:true, valid:<found&&active> }`.
This is the **periodic re-validation** (every `ELIG_TTL_MS`) that revokes access for
accounts that go inactive — **without** requiring a new OTP.

> **Persistent-login hardening (this deployment):** `ai-access.js`'s `session` action now
> treats **only** a definitive `{ ok:true, valid:false }` as "account removed" (immediate
> logout). A transient re-check failure (proxy error, parse error, or a library-auth 5xx
> from a DB/network blip) **no longer logs the user out** — the still-valid, HMAC-signed
> token is kept and the eligibility check is deferred to the next load. Security is
> unchanged (revoked accounts still lose access; OTP/broker/HMAC/15-day-cap all intact);
> only "couldn't reach EA right now" stopped masquerading as "revoked".

---

## 6. Routing Engine

The **Content Intelligence Center is the single source of routing truth.** The persisted
config lives in `site_settings` under key `chatbot_routing` and is read into
`ctx = { database, graph, live, calc, openai }` by `buildExecutionContext()`
(`ai-chat.js`). Every flag **defaults to `true`**, so an absent/unreadable config is
byte-for-byte the historical behavior.

Each source has **exactly one gated answer-producing path**, so "only X enabled" is
structurally guaranteed:

| Source | Flag | Produces | Gated at |
|---|---|---|---|
| **Live APIs** | `ctx.live` | `directAnswer` (market context, prices, calendar, "why is gold moving") | market-awareness / market-context / market-explain / market-coverage blocks |
| **Calculator** | `ctx.calc` | `directAnswer` (deterministic lot/RR/pip math) | `detectCalcRequest` + `runCalculator` |
| **Knowledge Graph** | `ctx.graph` | `kbAnswer` (5-part coach from concept fields) | `retrieveBest` block |
| **Database** | `ctx.database` | article-sourced answer + knowledge-orchestrator | article-search + `buildKnowledgeLayer` blocks |
| **OpenAI** | `ctx.openai` | fresh generated answer + LLM rephrase of any draft | `generateEducationalAnswer` block + `setComposer` registration |

**Single-provider isolation** (verified in code):
- Only OpenAI enabled → every eligible question is answered directly by OpenAI. (The old
  hidden gates — `AI_LEARN_ENABLED` env var and "intent must be `fallback`" — were
  **removed**; `ctx.openai` is now the sole gate, minus a small deliberate exclusion set:
  greeting/smalltalk/offtopic/signal/journal/setcountry/profile/assess/lotsize, each of
  which has its own correct reply an LLM must not overwrite or guess at.)
- The **LLM rephrase composer** (`makeLLMComposer`) is registered **only when `ctx.openai`
  is on** — disabling OpenAI now genuinely means *no LLM touches the reply*, not merely
  "no fresh generation".

**Multi-source behavior** (§10): routing is **intent-aware, not a fixed numeric priority**.
Time-sensitive intents skip static sources and go straight to live handlers; static/educational
intents prefer the graph/database. See §10.

---

## 7. Intent Detection

`intent-engine.js::classifyIntent(text)` — pure, keyword+pattern classification into ~30
intents, checked in a deliberate order (most specific first). Representative buckets:

- **Conversational:** `greeting`, `smalltalk` (thanks/bye/how-are-you/good-morning).
- **Live-market:** `gold`, `btc`, `macro`, `brief`, `mood`, `session`, `events` (news/CPI/NFP/FOMC/calendar).
- **Static/educational:** `strategy`, `technical` (support-resistance/price-action/market-structure/candlesticks), `psychology`, `riskmgmt`, `knowledge`, `journal`, `career`, `funding`, `platform`.
- **Tools/identity:** `assess`, `lotsize`, `selfassess`, `chart`, `broker`, `signal`, `setcountry`, `profileinfo`, `aboutme`, `islamic`.
- **Fallbacks:** `offtopic` (off-topic marker + no trading vocab → polite decline), `fallback` (last-resort default when nothing matched).

Intent is later refined in `ai-chat.js` (`p10Intent`) by cognition, underlying-need detection,
and multi-question handling.

---

## 8. Confidence Layer

`confidence-engine.js::assessConfidence(text, cognition, lang)` decides whether the AI is
allowed to answer directly or must ask a question first. It returns
`{ confidence, requiresClarification, clarificationQuestion }`.

Triggers for low confidence:
- A **buy/sell decision** question missing timeframe/entry/risk (`should I buy gold?`).
- **High cognitive ambiguity** (from `question-cognition.js`).
- **Vague topic words** (`Analysis`, `Daily Plan`) — short input, no instrument named.

This is separate from *knowledge* confidence (`knowledge-intelligence.js`), which governs
"can we verify this fact?" and prevents fabrication (unknown → honest unknown, never a guess).

---

## 9. Clarification Layer

When `requiresClarification` is true, `ai-chat.js` short-circuits to `clarifyAnswer` — a
single, targeted question — **instead of rejecting** the user. Examples (localized en/ur/ur-roman/ar):

| User says | Clarification |
|---|---|
| `Analysis` | "Which market would you like me to analyse — Gold, Forex, BTC, or another instrument?" |
| `Daily Plan` | "Are you asking about today's trading plan? Tell me the instrument…" |
| `should I buy gold?` | "Are you trading this short-term (scalp/intraday) or a longer swing?" |

**Guards that prevent over-clarifying:** greetings, small-talk, and concrete live-data
intents (gold/btc/news/brief/…) are **never** clarified — they have deterministic handlers
that always return a real answer, so a clarification there would replace a working answer
with a needless round-trip.

---

## 10. Static vs Live Knowledge

This is the **freshness contract**, enforced structurally:

- **LIVE** (today's gold / BTC / news / CPI / NFP / FOMC / calendar / market summary):
  `MARKET_DUMP_INTENTS = { gold, btc, macro, brief, mood, events, session }`. These are
  answered by live handlers (`market-engine`, `market-context`, live `/api/sentiment` +
  calendar). **They are excluded from the database-article and knowledge-layer fallbacks**
  — a stale article can never stand in for live data. If Live API is disabled/unavailable,
  the handler returns an honest "live data isn't available right now" reply, **never** old
  content presented as current.
- **STATIC** (psychology, risk management, support/resistance, price action, candlesticks,
  market structure, journal, education): answered from the **Knowledge Graph** (durable
  concepts) or **Database** (published articles). Safe to serve from stored content.

This is *how* multi-source routing chooses correctly without a fixed priority table:
intent classification already encodes "does this need freshness?".

---

## 11. Response Pipeline

For a single turn, the answer is built as at most **one** of these, in intent-aware order:

1. `clarifyAnswer` — a clarification question (safe tier).
2. `directAnswer` — live-market / calculator / honest-unavailable (live/calc tier).
3. `kbAnswer` — Knowledge Graph 5-part coach (graph tier):
   *direct answer · ⚠️ common mistake · 🎯 professional insight · 🛡️ risk warning · 📊 market context · next-step invite.*
4. Database article answer (database tier).
5. OpenAI generated answer (openai tier).
6. Rule-engine baseline (`generateResponse` → `specialist-router`) — real, specific handlers
   for gold/psychology/risk/strategy/journal/etc.
7. Safe reply (`buildSafeReply`) — **only** for genuinely `fallback`/`offtopic` intents; a
   professional "here's what I can/can't help with", never a bare "I don't know".

Then: `composeAnswer()` merges lead/prefix/body/disclaimer into one message (optionally
LLM-rephrased when `ctx.openai`), suggestion + action chips are attached, a
never-a-dead-end fallback-path chip set is added if empty, the optimizer runs, and the
Telegram/WhatsApp contact footer + source badge are appended.

**Anti-hallucination guarantees:** graph-only facts; unknown stays unknown; the LLM
rewrites but never adds facts/prices/signals; signal requests are routed to Telegram/WhatsApp,
never freelanced.

---

## 12. Response Optimizer

`response-optimizer.js` (pure, fail-safe, runs last):
- **`optimizeAnswer`** — caps the answer to **≤ 220 words / ≤ 7 paragraphs** (raised from
  120/3 so the structured 5-part coach completes without a mid-thought "…" truncation).
  The educational disclaimer and any links are always preserved. `wantsDetail(userText)`
  removes the cap when the user explicitly asks for depth. Nothing can ramble to abuse
  the ceiling (OpenAI is prompted `<120w`, DB bodies are pre-sliced, live replies are short).
- **`optimizeChips`** — ≤ 3 contextual follow-up chips, ≤ 4 words each, generic labels dropped.

Any error returns the original input untouched — the optimizer can never break a reply.

---

## 13. Content Intelligence Center

`admin/pages/content-center.html` + `admin/js/content-center.js` — a single admin page that
merges article management, knowledge-graph admin, SEO health, and the **Chatbot Checker**.
It is orchestration only: every read/write calls an existing endpoint (`/api/ai-articles`,
`/api/ai-kb-admin`).

- **Production Routing panel** writes the `chatbot_routing` config that `ai-chat.js` reads
  (`ctx`). Changing a toggle affects **every real visitor immediately**. Client + server both
  enforce "at least one source must stay enabled".
- Publishing an article flows through `syncArticleToGraph()` → concept authoring → graph
  publish → SEO by-products (FAQ schema, internal links, sitemap entry). The SEO half is
  decoupled: a graph-sync failure never blocks a published article's SEO page.

**Content strategy note (advisory, not enforced in code):** not every article needs to
enter the Knowledge Graph. Evergreen educational content (risk, psychology, structure,
patterns) is the right graph candidate; time-sensitive/news content should stay SEO-only;
thin content archived. Gating graph-entry on article *category* would curb graph bloat and
duplicate knowledge — a low-risk future config change, not yet implemented.

---

## 14. Admin Preview

The **Chatbot Checker → Diagnostic Mode** calls the **exact same** `/api/ai-chat` endpoint a
real visitor uses. There is **no second engine and no testing-only answer logic**. The only
differences for an authenticated admin-diagnostic request are:
1. It bypasses the guest message-limit (an admin diagnosing answers must not be rate-limited).
2. "Custom source" mode may pass `sourceFlags` to override routing **for that one call only**
   (never persisted). "Simulate real visitor" sends no override → `ctx` is computed identically
   to a real visitor's.

Therefore the admin preview and the public chatbot produce the **same reasoning, routing, and
answer** for the same question + same routing config.

---

## 15. Public Chatbot

`ai-trade-assistant.html` — the visitor UI. Notable behaviors:
- SSE streaming with a live source badge, follow-up chips, and action chips.
- Multi-language selector; TTS ("Speak") + voice input (Web Speech API).
- Persistent identity via `localStorage` (`ztu_ai_identity`), restored on load by
  `checkAccess()`, shared with `library.html` (`ztu_lib_v3`).
- Guest gate: free messages until the limit, then the localized "become an IB partner" card.
- Manual logout (`ztuLogout` / `ZTUPremiumCard.logout`) clears the AI token, verified flag,
  and shared Library session, then reloads.

---

## 16. Security Model

- **Stateless signed tokens** (HMAC-SHA-256, `LIBRARY_OTP_SECRET`) — tamper-evident, no
  server session store, no per-chat DB hit. Editing a token invalidates it.
- **Guest counter** is a signed cookie (`ztu_ai_guest`, HttpOnly, Secure, SameSite=Lax) —
  tampering resets to 0, never grants extra messages.
- **Timing-safe signature comparison** (`timingSafeEq`).
- **No PII in tokens.** Eligibility (broker/EA) is re-checked server-side against the Library
  source, never trusted from the client.
- **OTP, attempt limits, and cooldowns** are owned by `library-auth.js` and unchanged.
- **Admin diagnostics** require an authenticated admin session (`requireAdminModule`) or the
  legacy `x-admin-key` — a public visitor can never pass `sourceFlags`.
- **Secrets** (`LIBRARY_OTP_SECRET`, Supabase service key, LLM keys) stay server-side; never
  shipped to the client.

---

## 17. Current Production Limitations

1. **LLM binding must be configured externally.** If neither Cloudflare Workers AI (`env.AI`)
   nor an OpenAI key (`OPENAI_ENABLED` + `OPENAI_API_KEY`) is set, OpenAI routing and the
   human-rephrase pass are inert and answers are pure rule-engine/graph templates.
2. **Analytics source labeling** doesn't yet distinguish "rule-engine answered for real" from
   the `safe` tier — under-reports genuine answers (reporting only, not user-facing).
3. **Multi-source selection is intent-based, not a numeric freshness/accuracy scorer.** It
   works, but a true scoring engine (if ever wanted) would be a larger change.
4. **Graph-entry is not category-gated** — every published article can enter the graph, which
   can grow it faster than necessary (see §13).
5. **Heavy "personality" layer.** ~13 mentor/emotion/teaching/relationship modules feed the
   lead cascade; they add maintenance surface without a measured link to the business KPIs and
   are candidates for simplification.

---

## 18. Future Improvements

- Confirm/activate the production LLM binding; monitor answer quality.
- Category-gate graph entry (evergreen-educational only) to curb graph bloat.
- Add a distinct analytics source label for rule-engine answers.
- Consider trimming the lowest-value personality modules (audit-recommended, not yet done).
- Wire Search Console / GA so content + chatbot impact on rankings is actually measured.

---

## 19. Deployment Notes

- **Runtime:** Cloudflare Pages + Functions. Push to the repo → Pages auto-deploys.
- **No SQL / no Supabase schema change** is required by the current changes.
- **Environment variables** (all server-side):
  - `LIBRARY_OTP_SECRET` — **required** (token signing; shared with Library).
  - `AI` (Workers AI binding) *or* `OPENAI_ENABLED=true` + `OPENAI_API_KEY` — enables the LLM
    layer. Optional `OPENAI_FALLBACK_ENABLED`, `OPENAI_MODEL`, `LLM_*`.
  - `AI_VISITOR_MESSAGE_LIMIT` (default 5), `AI_ADMIN_KEY` (admin diagnostic), `AI_DEBUG`.
  - Supabase (AI + Library) credentials for memory/eligibility (graceful no-op if absent).
- **Caching:** HTML is `max-age=300`; `/assets/*.js` is `max-age=3600, must-revalidate`.
  After deploy, a hard refresh / cache purge ensures the new client is picked up.
- **Routing config** (`chatbot_routing`) is data in `site_settings`, not code — no deploy
  needed to change routing; it takes effect on the next request.

---

## 20. Testing Checklist

> **Runtime note:** these Functions require the Cloudflare runtime + live Supabase/EA/market
> APIs. They cannot be exercised by a static file server, so the list below **must be run
> against a deployed (preview or production) environment.**

**Routing modes** (set in Content Intelligence Center → Production Routing):
- [ ] **OpenAI only** — "explain risk management" → fresh LLM answer, not a generic decline.
- [ ] **Database only** — a topic with a published article → answer sourced from that article.
- [ ] **Knowledge Graph only** — "what is support and resistance" → full 5-part coach, no "…" truncation.
- [ ] **Live API only** — "today's gold" → live market context.
- [ ] **Calculator only** — "2% risk on 10000 account, 20 pip stop" → exact math.
- [ ] **Mixed (all on)** — live vs static questions route to the right source.

**Freshness safety:**
- [ ] Live API **off** + "today's gold / today's CPI" → honest "live data unavailable", **never** a stale article.

**Conversation:**
- [ ] "hi", "hello", "good morning", "thanks", "bye" → natural, never a fallback.
- [ ] Bare "Analysis" → "Which market…?"; "Daily Plan" → plan clarification; "gold analysis" → answers directly.
- [ ] "trading journal" → the reply linking to `/journal.html`.
- [ ] An off-topic question → professional scope decline, not "I don't know".

**Admin preview parity:**
- [ ] Same question + same routing in Diagnostic Mode returns the same answer as the public chatbot.

**Authentication / persistent login:**
- [ ] Verify with Account Number + OTP → `Unlimited` badge appears.
- [ ] **Refresh the page** → still verified, no OTP re-prompt.
- [ ] **Close and reopen** within 48h (and up to 15 days) → still verified.
- [ ] Simulate a transient EA/DB blip during the daily re-check → user stays logged in (not forced to re-OTP).
- [ ] A genuinely revoked/inactive account → access removed on next re-check.
- [ ] **Manual logout** → session cleared immediately (AI token + Library session gone); next load requires verification.

---

_Last updated for the persistent-login hardening + response-optimizer ceiling changes._

# ZTU Trading AI Assistant — Production Roadmap
_Audit date: 2026-06-14 · Author: Senior AI Systems Architect audit · Stack: Cloudflare Pages Functions + Supabase_

> **Headline finding:** The "production-grade ChatGPT-level Trading AI" you asked for is **already built** across 31 prior phases. The generative layer is the only thing not switched on — and the switch is **environment variables, not code.** This roadmap is therefore mostly an *activation* plan, not a *build* plan. Nothing below rebuilds or breaks existing systems.

---

## 1. STATUS LEDGER (your 15 phases, mapped to reality)

### ✅ COMPLETED & WORKING (do not touch)
- **Intent → understand → normalize → validate → classify → source → generate** pipeline — `intent-engine.js`, `question-cognition.js`, `slang-normalizer.js`, `relevance-engine.js`, `composer.js`
- **Knowledge priority engine** (DB graph → KB_SEED → articles → FAQ → live APIs → LLM last) — `graph-retrieval.js`, `article-knowledge.js`
- **Live data router + fallback** — `market.js`, `sentiment.js`, `news.js`, `calendar.js`, `market-context.js`
- **Semantic search (lexical)** — `semantic-retrieval.js`, `retrieval-boost.js`, `retrieval-lexicon.js`
- **Auto knowledge growth + admin review** — `evolution-engine.js`, `kb_missing`, `/api/ai-kb-admin?action=evolution`
- **Cross-session memory** — `memory-engine.js`, `ai-supabase.js`, tables `ai_user_profiles` / `ai_chat_memory`
- 385-concept knowledge graph / 35 categories, 0 duplicate / 0 orphan / 0 invalid

### 🔌 BUILT BUT DORMANT (activate via env vars — no code needed)
- **LLM humanization layer** — `composer-llm.js`, wired at [`ai-chat.js:500`](functions/api/ai-chat.js). Already speaks **both** Cloudflare Workers AI (`env.AI`) **and** OpenAI (`LLM_ENDPOINT` + `LLM_API_KEY`).
- **Embedding / vector semantic search** — `embedding-provider.js`, `hybrid-scorer.js`. Gated by `KB_EMBEDDINGS_ENABLED`.

### 🟡 PARTIAL (small additive work — optional)
- **Domain guard (Phase 3)** — keyword blacklist only ([`intent-engine.js:318`](functions/utils/intent-engine.js)). Off-domain (CV, politics, medical) and prompt-injection ("ignore previous instructions") aren't *answered* off-topic, but get a generic fallback instead of a clean refusal. **Note:** the LLM composer cannot be hijacked by injection — it only ever rephrases an already-grounded draft and aborts on drafts < 24 chars.
- **LLM-answer cache (Phase 8)** — cross-session memory exists; no dedicated hash-keyed cache of validated LLM outputs yet.

### ❌ BROKEN / MISSING
- **None found.** No broken wiring, no dead APIs, no missing connections in the AI path.

### 🔮 OPTIONAL FUTURE
- Public article-page route + dynamic sitemap (currently manual)
- Vector backfill of all 385 concepts (one-time job once embeddings are on)

---

## 2. CHOSEN ARCHITECTURE — Hybrid LLM (your selection)

```
User question
   ↓  (existing pipeline — unchanged)
Grounded draft assembled from knowledge graph
   ↓
composer-llm.js
   ├─ Cloudflare Workers AI (env.AI)      ← DEFAULT: free-tier, low latency, everyday rephrasing
   └─ OpenAI gpt-4o-mini (LLM_ENDPOINT)   ← FALLBACK: only when CF unavailable / premium quality
   ↓
Natural, human, ChatGPT-style answer (facts unchanged — graph stays source of truth)
```

**Cost behaviour:** Workers AI carries ~all traffic at ~$0. OpenAI only bills on fallback. The LLM-answer cache (item P3 below) drops repeat-question cost to $0 on both.

> ⚠️ One code note for when you implement: `composer-llm.js` today prefers `env.AI` **or** the OpenAI endpoint — it does **not** yet auto-fail-over from CF to OpenAI within one request. True hybrid fail-over is a ~15-line additive change to `callModel()` (try `env.AI`, on error fall through to `LLM_ENDPOINT`). Until then, setting **both** means Workers AI is used and OpenAI sits ready as the manual/secondary path. This is the only code change the hybrid choice implies, and it is optional.

---

## 3. PRIORITIZED IMPLEMENTATION ORDER (safest first)

| # | Task | Type | Risk | Effort |
|---|------|------|------|--------|
| **P1** | Turn on Workers AI (humanization) | env only | none | 5 min |
| **P2** | Turn on embeddings + backfill | env + 1 job | none | 20 min |
| **P3** | Add LLM-answer cache | +1 file | none | additive |
| **P4** | Harden domain guard (refusal + injection) | +1 file, +1 guarded block | low | additive |
| **P5** | Add OpenAI as true fallback | edit `callModel()` (~15 lines) | low | additive |

Do them top-down. Each is independently shippable and reversible (remove the env var → instant revert to today's behaviour).

---

## 4. P1 — ACTIVATE WORKERS AI (beginner micro-steps)

**No code. Environment variables only. Your code already listens for these.**

### Step-by-step (Cloudflare Dashboard)
1. Open https://dash.cloudflare.com and log in.
2. Left menu → **Workers & Pages**.
3. Click your ZTU Pages project (the website).
4. Top tabs → **Settings**.
5. Scroll to **Bindings** (or "Functions" → "Bindings" depending on UI).
6. Click **Add binding** → choose **Workers AI**.
7. **Variable name:** type exactly `AI`  ← (this becomes `env.AI` in code)
8. Click **Save**.
9. Go to the **Deployments** tab → **Retry deployment** (or push any commit) to redeploy.

### Optional env vars (only if you want non-defaults)
| Variable | Purpose | Type | Default if unset |
|----------|---------|------|------------------|
| `LLM_MODEL` | Override the chat model | Plain text | `@cf/meta/llama-3.1-8b-instruct` |

### How to verify
1. Open your live chatbot page.
2. Ask: **"Teach me Smart Money Concept."**
3. The answer should read more naturally/varied than before (not templated).
4. Ask the **same question twice** — wording should vary slightly = LLM is live.
5. If answers look identical to before → the `AI` binding name is wrong or redeploy didn't run.

---

## 5. P2 — ACTIVATE EMBEDDINGS (semantic search upgrade)

**Manual action required.**

### Cloudflare Dashboard → Settings → Variables and Secrets → Add
| Variable | Value | Type |
|----------|-------|------|
| `KB_EMBEDDINGS_ENABLED` | `true` | Plain text |
| `AI_EMBED_MODEL` | `@cf/baai/bge-base-en-v1.5` | Plain text (optional — this is the default) |

(The `AI` binding from P1 is reused for embeddings — no new key.)

### Then run the one-time backfill
- Trigger your existing populate route so each graph concept gets a vector:
  `POST /api/ai-kb-admin` with `action=populate` (the same route memory documents for `populateAnchors`).
- This is idempotent and safe to re-run.

### Verify
- Ask a **vague paraphrase** memory flagged as previously failing, e.g. **"can I trade with 100 dollars"** → should now surface the `small-account-100` concept with HIGH confidence.

---

## 6. P3 — LLM-ANSWER CACHE (cost saver — additive build)

**When you ask me to build this:** one new leaf file `functions/utils/llm-cache.js`:
- Key = hash of the **normalized** question (reuse `normalizers.js`).
- Store validated LLM output in `ai_chat_memory` (existing table — no new SQL) or KV.
- On hit → return cached answer, **skip the LLM call entirely** ($0).
- Wired with a single guarded block around the `composer-llm` call in `ai-chat.js`. No existing line edited.

---

## 7. P4 — DOMAIN GUARD HARDENING (Phase 3 — additive build)

**When you ask me to build this:** one new leaf file `functions/utils/domain-guard.js`:
- `isInjection(text)` → blocks "ignore previous instructions", "you are now…", "system prompt", role-override attempts.
- `isOffDomain(text)` → catches politics / medical / religion / coding / personal-assistant ("write my CV") that the current 30-word blacklist misses, **without** false-positiving on trading vocab.
- Returns the localized refusal: _"I am a Trading AI Assistant and can only help with trading-related questions."_ (en/ur/ur-roman/ar — per the frozen localization rule).
- Wired as **one guarded block** early in `ai-chat.js`, before retrieval. No existing line edited; existing keyword guard stays as-is.

---

## 8. P5 — OPENAI TRUE FALLBACK (only if you want belt-and-suspenders)

### Cloudflare Dashboard → Settings → Variables and Secrets → Add **Secret**
| Variable | Purpose | Type | Where |
|----------|---------|------|-------|
| `LLM_ENDPOINT` | `https://api.openai.com/v1/chat/completions` | Plain text | Cloudflare Pages only |
| `LLM_API_KEY` | Your OpenAI key (`sk-...`) | **Secret** (encrypted) | Cloudflare Pages only |
| `LLM_MODEL` | `gpt-4o-mini` | Plain text | Cloudflare Pages only |

**Security rules (Phase 10/13):**
- `LLM_API_KEY` is a **Secret**, never plain text, never in GitHub, never in frontend HTML/JS.
- Get the key at https://platform.openai.com/api-keys → set a low monthly **usage limit** there first.
- Verify: temporarily remove the `AI` binding, ask a question, confirm a reply still comes back (= OpenAI path works), then re-add `AI`.

**Code:** requires the ~15-line `callModel()` fail-over edit described in §2. I'll do it additively when you're ready.

---

## 9. FROZEN — NEVER REBUILD OR BREAK
APIs · knowledge graph (`kb_*`) · memory tables (`ai_user_profiles`, `ai_chat_memory`) · Mentor Brain · Language Lock (`intent-engine.detectLanguage`) · composer single-reply contract · KOS validator · lead-precedence cascade. All work here is **additive only** (new files / new guarded blocks). Every change verified live before claiming done.

---

## 10. RECOMMENDED NEXT ACTION
Start with **P1 (5 minutes, env only)** — it delivers the biggest visible jump (ChatGPT-style answers) at zero risk and zero cost. If you like the result, do **P2**. Treat **P3–P5** as a second session where I build the 2 small additive files. Say the word and I'll implement any of them — verified locally — without touching the frozen core.

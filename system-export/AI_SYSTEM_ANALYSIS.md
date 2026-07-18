# Scaliyo — AI System Analysis

> Every AI capability traced to its implementation. All findings evidence-based. Read-only. No secrets.

## 0. Highest-impact findings (read this first)

1. **Two disconnected "business profile" stores.** Nearly all generation reads the **per-USER** `profiles.businessProfile` JSON, not the **per-BUSINESS** `business_profiles` table. In a multi-business workspace, Business B's outreach can carry Business A's positioning/value-prop/tone. (§4)
2. **AI memory is not business-isolated.** `workspace_memory`, `lead_memory`, `campaign_memory` have `workspace_id` but **no `business_id`** (verified in DB). All businesses in a workspace share one memory pool. (§4)
3. **Business-profile analysis is prompted to crawl the web, but grounding is disabled** — the model only sees a pre-scraped blob (homepage + 6 fixed subpaths). This prompt/reality mismatch + SPA-empty-body scraping + no schema-constrained decoding is the root cause of incomplete/inaccurate profiles. (§2)
4. **AI does NOT guide VOIP calls.** Twilio functions contain zero AI. "AI-assisted calls" is aspirational. (§8)
5. **Several server AI paths bypass the credit ceiling** (`ai-chat-stream`, `process-email-writing-queue`, `preview-sequence-email`, all goal-steps, `image-gen`). (§7)
6. **The automated send pipeline injects no memory or reply content** — scheduled campaign emails ignore `lead_memory`/`campaign_memory` and never learn from what prospects actually replied. (§9)

## 1. Models, providers & routing

Central config `AuraEngine/lib/aiConfig.ts`: `text`/`textGrounded` = `gemini-2.5-flash`; `image` = `imagen-4.0-generate-001`; `textTesting` = `gemini-flash-lite-latest`. The earlier OpenAI `gpt-4o-mini` switch was reverted; the proxy still supports routing.

Routing in `gemini-proxy/index.ts:51-77`: `gpt-*/o[1-9]/chatgpt/text-*` → OpenAI; images → Gemini; any request with `googleSearch`/`urlContext` tools force-routed to Gemini. Since `aiConfig.text` is a `gemini-*` name today, **all traffic goes to Gemini**.

**Model names are NOT centralized in edge functions** (Deno can't import the client config):

| Function | Model |
|---|---|
| `ai-generate`, `ai-chat-stream`, `enrich-lead`, `preview-sequence-email`, `process-email-writing-queue` | `gemini-2.5-flash` (hardcoded each) |
| `_shared/goal-steps/gemini.ts`, `goal-replanner` | **`gemini-3-flash-preview`** (preview alias) |
| client `lib/gemini.ts` | `AI_MODELS.text` |

**Risk:** `gemini-3-flash-preview` in two server paths is uncentralized; if it deprecates (as `gemini-2.0-flash` did), goal execution/replanning fail silently. The proxy also works around a pinned-SDK hang by stream-accumulating non-streaming calls and using raw REST for grounded calls.

## 2. Business-profile analysis (the user's key concern)

**Flow (`analyzeBusinessFromWeb`, `lib/gemini.ts:1017-1287`):** load prompt → `fetch-page` scrape (20s race) → append scraped text to prompt → **non-grounded** generation via `ai-generate` SSE → `parseAnalysisJSON` (regex).

**`fetch-page` (`supabase/functions/fetch-page/index.ts`):** plain GET of homepage + **6 hardcoded subpaths** (`/about`, `/about-us`, `/services`, `/products`, `/pricing`, `/solutions`), extracts title/meta/OG/JSON-LD + stripped body, capped 45k chars, SSRF-guarded, auth required.

**Why it is incomplete/inaccurate — root causes:**
- **Prompt/reality mismatch (biggest):** the template instructs the model to *crawl* ("Extract internal links from Header/Footer/Sitemap.xml… Maximum crawl depth: 40 internal pages") but **grounding is disabled** — the model can only read the pre-scraped blob. It's told to do something it structurally cannot.
- **SPA blind spot:** JS-rendered sites return an empty `<body>`; only head/meta/JSON-LD survive → thin input, thin output.
- **Only 7 fixed paths, no sitemap/link discovery** — `/company`, `/team`, `/features`, `/plans` are never fetched even though the prompt prioritizes them.
- **No schema-constrained decoding:** `ai-generate` sends no `responseSchema`/`responseMimeType`; output is free-form and depends on the fragile `parseAnalysisJSON` regex → total failure returns `analysis: null`.
- **Fetch-timeout degradation:** if scrape >20s, `pageText=''` and the model infers from the **URL string alone**.
- **Confidence scores are model self-reported**, never validated against source text.

**Document path (`analyzeBusinessFromDocument`)** forces Gemini with the file as `inlineData` (native PDF/image read) — generally more reliable than the web path. **Per-field "Write with AI"** uses sibling fields as context; forbids placeholder text.

## 3. Per-capability inventory

| Capability | Entry | Model | Grounded | Validation | Credit ceiling |
|---|---|---|---|---|---|
| AI chat (Command Center) | `ai-chat-stream` | 2.5-flash | No | SSE text → `ai_messages`/`ai_threads` | ❌ rate-limit only |
| Business analysis (web) | `analyzeBusinessFromWeb`→`fetch-page`→`ai-generate` | 2.5-flash | No (scrape-then-infer) | regex, no schema | ✅ |
| Business analysis (doc) | `analyzeBusinessFromDocument` | 2.5-flash (forced) | Native file | regex | ✅ |
| Lead research (client) | `generateLeadResearch` | 2.5-flash | Yes (googleSearch, falls back) | regex | ✅ |
| Lead enrichment (background) | `enrich-lead` | 2.5-flash | Yes (googleSearch+urlContext, falls back) | regex → `leads.knowledgeBase` | ✅ |
| Email personalization (send) | `process-email-writing-queue` | 2.5-flash | No | **responseSchema JSON + thinkingBudget:0**; retry≤3→failed | ❌ direct REST |
| Email preview | `preview-sequence-email` | 2.5-flash | No | same schema | ❌ direct REST |
| Content/blog/social/proposal | `lib/gemini.ts` | 2.5-flash | No | free text | ✅ via proxy |
| Dashboard/next-action | `contextPacket.suggestNextAction` | 2.5-flash | No | JSON, confidence clamp | ✅ |
| Goal planner | `generateGoalPlan` | 2.5-flash | No | JSON | ✅ |
| Goal steps (enrich/score/email/social) | `_shared/goal-steps/*` | **3-flash-preview** | No | JSON, score clamp | ❌ direct key |
| Goal replanner | `goal-replanner` | **3-flash-preview** | No | JSON | ❌ direct key |
| Image gen | `image-gen` | **STUB (SVG placeholder)** | — | — | ❌ (writes to a nonexistent table) |
| Real image gen | `lib/imageGen.ts` | Imagen 4 via proxy | — | base64 | ✅ |
| Voice widget | ElevenLabs | — | — | — | n/a (not call AI) |

## 4. Data isolation & cross-business mixing (verified)

**A. Two disconnected business-profile representations.**
- `profiles.businessProfile` (JSON on the **user** row, camelCase) — read by `buildBusinessContext` and injected into ContentStudio, AICommandCenter, campaign generators (dozens of sites).
- `business_profiles` (table keyed by **`business_id`**, snake_case, the intended "brain") — read **only** by `contextPacket.suggestNextAction`.
- **Consequence:** the per-business brain is disconnected from the outreach/content generators; the single user-level profile is injected regardless of which business is active → cross-business positioning leakage.

**B. Memory not business-isolated (verified):** `workspace_memory`/`lead_memory`/`campaign_memory` have `workspace_id`, no `business_id`. `buildMemoryContext` filters by workspace only → all businesses share one memory pool (winning patterns, tone, "avoid" facts) injected into planner + outreach prompts.

**C. First-workspace resolution:** `resolveWorkspaceForUser` picks the earliest membership, cached per session.

**D. Goal-executor lead ops are workspace-wide:** enrich/score/leads steps filter by `workspace_id` only → automations touch all businesses' leads.

**Properly isolated:** per-lead `knowledgeBase`/`insights`, per-lead email personalization, `contextPacket` (business-scoped), lead-ownership check in `enrich-lead`, and RLS on all tables. Leakage is at the **business-profile + workspace-memory** layers, not lead-level.

## 5. Grounding — grounded vs free-floating
- **Grounded w/ graceful degradation:** lead research + enrichment try `googleSearch`(+`urlContext`), fall back to **non-grounded inference** if empty → output may be invented on fallback.
- **Grounded only by injected data:** business analysis (scraped text), email personalization (lead fields/KB), planner (profile+memory).
- **One explicit anti-hallucination guardrail:** `suggestNextAction` ("Based ONLY on the data above"). Analysis prompts say "don't guess," but nothing enforces post-hoc.
- **Free-floating:** chat, content, blog, captions, proposals.

## 6. Prompt duplication / contradictions
- `buildBusinessContext` in **3 places** with drift (client "YOUR BUSINESS CONTEXT" richest; the two email fns "SENDER'S BUSINESS CONTEXT" fewer fields).
- `buildPrompt` **verbatim-duplicated** across `preview-sequence-email` and `process-email-writing-queue` (sync-by-convention hazard).
- `parseLeadResearchResponse` duplicated (client + Deno port).
- Model divergence 3-flash-preview vs 2.5-flash.
- Contradiction: analysis template claims autonomous crawling; runtime disables grounding.

## 7. Validation, guardrails, cost
- **Strongest validation:** email personalization uses Gemini `responseSchema {subject, body_html}` + `responseMimeType: application/json` + `thinkingBudget:0`; unguarded `JSON.parse` → throw → retry≤3 → `failed` (no silent bad sends).
- **Weakest:** business/lead analysis — no schema, regex-tolerant parse, `null`/partial on failure, no zod/type validation.
- **Rate limits:** proxy 60/min, ai-generate 30/min, ai-chat-stream 20/min (Postgres, cluster-wide, fail-open); image-gen 10/min in-memory (bypassable).
- **Credit ceiling (`enforce_ai_proxy_quota`, fail-closed):** enforced on gemini-proxy, ai-generate, enrich-lead. **NOT** on ai-chat-stream, process-email-writing-queue, preview-sequence-email, goal-steps, image-gen (they hit `GEMINI_API_KEY` directly).
- **Input caps:** chat prompt 20k/leadContext 50k; ai-generate 200k; fetch-page 45k. Personalization clips `knowledgeBase`→500 chars, `custom_fields`→400 chars — rich KBs heavily truncated before the model.

## 8. VOIP / call AI
**No AI guides VOIP calls** — `twilio-*` functions have zero Gemini/OpenAI usage; `lib/twilioVoice.ts` is a plain dial client. No AI call scripts, live suggestions, transcription, or summaries. **ElevenLabs agents are a website/support navigation assistant**, not lead-call guidance.

## 9. Using replies & prior interactions
- Engagement signals (opens/clicks/bounces) **are** captured to `lead_memory` via `log_lead_memory_email_event`.
- **Inbound reply CONTENT is NOT fed into AI** — `inbound-email` writes only to `inbound_emails`; no memory/AI writer. The AI never learns from what prospects said.
- **The automated send pipeline injects no memory** — `process-email-writing-queue` includes no `lead_memory`/`campaign_memory`. Memory is used only in client-side ad-hoc generation. So scheduled campaign emails ignore memory entirely.

## 10. Recommended stronger AI architecture

**Principle: one retrieval-grounded, business-scoped, validated context pipeline feeding every generator.**

1. **Unify the business brain.** Make `business_profiles` (business_id-scoped) the single source; deprecate `profiles.businessProfile` or sync it one-way. Every generator resolves the *active business_id* and injects that business's profile — never the user-level blob.
2. **Add `business_id` to the memory tables** and filter memory by `(workspace_id, business_id[, lead_id, campaign_id])`. Backfill from existing rows' campaign/lead business.
3. **Retrieval layer.** Store business docs, prior winning emails, and **reply transcripts** as embeddings; retrieve top-k per generation with **source attribution** returned to the UI. Feed inbound reply content into `lead_memory`/`campaign_memory`.
4. **Structured outputs everywhere.** Replace `parseAnalysisJSON`/`parseLeadResearchResponse` regex with `responseSchema` + a shared zod validator; reject/repair on schema failure instead of dropping fields.
5. **Fix business analysis grounding.** Either (a) enable real grounded crawl for analysis (server-side, with the SSRF guard), or (b) rewrite the prompt to match the scrape-then-extract reality and expand `fetch-page` to sitemap/link discovery + a headless render for SPAs. Stop asking the model to "crawl."
6. **Confidence + human approval.** Surface model confidence with source snippets; require human approval before a low-confidence profile field or an AI-written email is used at scale.
7. **Close the credit-ceiling gaps.** Route `ai-chat-stream`, the email writer/preview, and goal-steps through `enforce_ai_proxy_quota` (or add equivalent server metering). Replace the in-memory image-gen limit.
8. **Centralize model config for edge functions** (a shared `_shared/aiModels.ts`), retire `gemini-3-flash-preview` for a GA model, and add a model-availability healthcheck.
9. **Inject memory into the send pipeline** so scheduled outreach benefits from winning patterns and reply history, not just ad-hoc client generation.
10. **Evaluation & monitoring.** Golden-set eval for business analysis + email personalization; log prompt/version + token cost per generation; alert on parse-failure and grounding-fallback rates.

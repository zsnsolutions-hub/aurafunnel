# Scaliyo — Gap Analysis

> **Vision:** *"A complete AI-powered growth and marketing platform that helps businesses discover, understand, score, contact, nurture, call, convert, and retain leads while managing multiple businesses and teams from one account."*
>
> Classification: **Complete · Mostly complete · Partially complete · UI only · Missing · Broken · Needs redesign.**

## Verb-by-verb assessment of the core promise

| Vision verb | Classification | Evidence |
|---|---|---|
| **Discover** leads | **Missing** | No data-provider integration. "Apollo" is dead scaffolding; search is a local filter over existing rows. |
| **Understand** leads (enrich/intel) | **Mostly complete** | Enrichment is a real grounded background job; research profile + next-action exist — but **hidden behind a default-off flag** and profile context isn't business-isolated. |
| **Score** leads | **Partially complete / Needs redesign** | A real signal-based scorer exists but is flag-hidden; the visible score is a `+5` placeholder. |
| **Contact** (email) | **Mostly complete** | Full campaign engine + 3-stage pipeline + tracking + inbox works (SMTP/SendGrid). Undercut by broken Gmail connect, no Outlook, latent double-send. |
| **Contact** (social) | **Broken (prod)** | Publishing code is real but all accounts are demo tokens → every publish fails; TikTok missing. |
| **Nurture** (sequences/replies) | **Mostly complete** | Sequences, A/B, best-time, reply attribution work; but reply *content* isn't fed to AI and memory isn't injected into the pipeline. |
| **Call** (VOIP) | **Partially complete (dormant)** | Fully built; blocked on Twilio secrets. |
| **Call — AI assistance** | **Missing** | No transcription/co-pilot/summaries. "AI-assisted calls" doesn't exist. |
| **Convert** (pipeline/CRM) | **Improved (Phase 4.E)** | `deals` table now adds value/stage/probability/close-date/forecast per lead (per-lead Deals tab); status enum retained. Standalone pipeline board still TODO. |
| **Retain** (post-sale) | **Missing** | No renewal/health/retention/customer-success features; CRM invoicing exists but no retention loop. |
| **Manage multiple businesses** | **Partially complete** | Real CRUD, but scoping is flag-off by default and AI context leaks across businesses. |
| **Manage teams** | **Broken** | Two disconnected team systems; no working invite path. |
| **From one account (multi-tenant)** | **Needs redesign** | Three overlapping tenancy models; `workspace_id==user.id` assumption; P0 profile-PII leak. |

## Capability-by-capability detail

### Growth / lead lifecycle
| Capability | Class | Evidence |
|---|---|---|
| Lead discovery/sourcing | **Missing** | no provider |
| Lead import/export | **Complete** | robust `import_leads_batch`; CSV export |
| Lead enrichment | **Complete** | grounded background job |
| Lead scoring (signal-based) | **Partially complete** | built but flag-hidden |
| Personalized lead profiles | **Partially complete** | built but flag-hidden |
| Company/contact intelligence | **Partially complete** | enrichment only; no firmographic provider |
| Pipeline / CRM stages | **Improved (4.E)** | status enum + `deals` (value/stage/probability/forecast) |
| Notes / tasks / reminders | **✅ Fixed (4.A/4.B)** | Notes→`lead_notes`, tasks→`tasks` table; persisted + RLS-verified. Reminder *delivery* still pending. |
| Activity log / timeline | **✅ Fixed (4.C)** | Activity log→`lead_activities`; unified `LeadProfile` timeline (notes/tasks/activities/calls/meetings/replies). |
| Lead score | **✅ Fixed (4.D)** | "Recalculate Score" wired to the canonical `recalcLeadScore` (`lib/leadScoring.ts`); arbitrary "+5" removed. |
| Activities timeline | **Partially complete** | real timeline; some log modals UI-only |

### AI
| Capability | Class | Evidence |
|---|---|---|
| AI chat / command center | **Mostly complete** | works; no credit ceiling |
| Business analysis (auto-profile) | **Partially complete / Needs redesign** | grounding disabled vs prompt; SPA blind spot; no schema |
| AI recommendations | **Mostly complete** | dashboard insights / next-action |
| Knowledge bases | **Partially complete / Needs redesign** | two unsynced stores; not business-isolated |
| Per-business knowledge separation | **Broken** | memory tables lack `business_id`; generators read user-level profile |
| Structured-output validation | **Partially complete** | strong for email; regex-only for analysis |
| AI-guided calls | **Missing** | none |

### Email & campaigns
| Capability | Class | Evidence |
|---|---|---|
| Email compose/preview/send | **Complete** | SendGrid + SMTP |
| Templates | **UI only / backend-only** | table exists, no user UI |
| Sequences & campaigns | **Complete** | full engine |
| A/B + auto-optimize + best-time | **Mostly complete** | works; data-starved until volume |
| Email validation | **Complete** | real mails.so |
| Reply tracking / inbox | **Mostly complete** | works; needs IMAP/hosted source |
| Gmail connection | **Broken** | stub, no callback |
| Outlook connection | **Missing** | SMTP workaround only |
| Deliverability (suppression/DLQ/health) | **Mostly complete** | enforced in send-email |

### Social & content
| Capability | Class | Evidence |
|---|---|---|
| Social composition/scheduling | **Mostly complete** | scheduler + cron |
| Instagram / Facebook publish | **Broken (prod)** | demo tokens fail |
| LinkedIn publish | **Broken (prod)** | demo tokens fail |
| TikTok | **Missing** | no code |
| Blog / long-form | **Complete** | draft→review→publish→render |
| Content generation | **Complete** | credit-gated |
| Image generation (text→image) | **Complete** | Imagen 4; no history |
| Content from image (vision) | **Complete** | ImageStudio |
| Media asset management | **Complete** | Supabase Storage |
| Calendar / external publish sync | **Missing** | no Google/Outlook calendar |

### Voice / calls
| Capability | Class | Evidence |
|---|---|---|
| Outbound/inbound calling | **Partially complete (dormant)** | built; needs Twilio secrets |
| Voicemail / recordings | **Partially complete (dormant)** | built |
| Call outcomes | **Complete** | manual + auto |
| Transcription / AI co-pilot / summaries | **Missing** | none |

### Platform
| Capability | Class | Evidence |
|---|---|---|
| Multi-business | **Partially complete** | flag-off scoping |
| Teams / collaboration | **Broken** | invite path broken |
| RBAC | **Partially complete** | tenancy roles real; no job roles |
| Billing / subscriptions | **Mostly complete / Needs redesign (security)** | Stripe works; P0 tampering + fail-open |
| CRM invoicing | **Complete** | real Stripe invoices |
| Credits / usage | **Mostly complete** | dual counter; some bypasses |
| Public API | **Complete** | v1-* with keys/idempotency |
| Webhooks (in/out) | **Mostly complete** | some unverified (Twilio; Stripe fail-open) |
| Notifications | **Missing (UI only)** | no table in migrations; nothing reads/writes/delivers; bell has a Math.random mock |
| Analytics / reporting | **Partially complete** | campaign analytics real; no salesperson/deal reporting |
| Automation / goals | **Partially complete** | executor + crons; flag-gated; workspace-wide |
| Admin console | **Complete** | full admin suite |
| Audit logs | **Complete** | audit + support sessions |
| Security / privacy controls | **Needs redesign** | P0 profile leak; fake deletion; no retention |
| Onboarding | **Partially complete** | cosmetic provisioning |
| Mobile | **Partially complete** | subset shell |

## Summary scorecard
- **Complete / Mostly complete:** email engine, enrichment, import, blog, content/image generation, public API, CRM invoicing, admin, audit, campaign analytics. **This is a strong email-marketing + content core.**
- **Partially complete / Needs redesign:** lead scoring/intel (hidden), business analysis, multi-business scoping, pipeline/CRM, automation, billing security, tenancy model.
- **Broken:** social publishing (prod), team invites, Gmail connect, lead notes/tasks.
- **Missing:** lead discovery, AI call assistance, Outlook, TikTok, external calendar, retention/customer-success, salesperson reporting, deals/opportunities.

**Verdict:** Scaliyo today is a **capable AI email-outreach + content platform with a strong backend**, not yet the "complete discover→convert→retain, multi-business, multi-team" platform the vision describes. The two ends of the funnel (**discover** and **convert/retain**) and **team collaboration** are the largest gaps; **social** and **calling** are built but not operational; **multi-business isolation** needs to be made real and safe.

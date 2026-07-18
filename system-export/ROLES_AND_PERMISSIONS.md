# Scaliyo — Roles & Permissions

> Based on enums, RLS policies, guard functions, and client checks. Read-only analysis.

## 1. Reality check: which requested roles actually exist

The brief asks about Platform owner, Workspace owner, Administrator, Manager, Sales rep, Marketing user, Content creator, Viewer, and Billing administrator. **Most of these do not exist as real roles.** Scaliyo has **four separate, partially-overlapping role systems**, none of which model job functions like "Sales rep" or "Marketing user":

| Role system | Storage | Values | Guard | Real? |
|---|---|---|---|---|
| **Platform role** | `profiles.role` (`user_role` enum) + `profiles.is_super_admin` | `ADMIN`, `CLIENT`, `GUEST` (+ super-admin flag) | `is_admin()`, `is_super_admin()` | ✅ enforced |
| **Workspace role** | `workspace_members.role` (`workspace_role` enum) | `owner`, `admin`, `member`, `viewer` | `is_workspace_member()` | ✅ RLS, but ~no UI to assign |
| **Business role** | `business_members.role` (text CHECK) | `owner`, `admin`, `member`, `viewer` | `is_business_member()`, `is_business_admin()` | ✅ RLS; assignment UI limited |
| **Team / Team Hub role** | `team_members.role`, `teamhub_flow_members` | `owner`, `admin`, `member`(, `viewer`) | `is_team_member()`, `teamhub_user_flow_role()` | ✅ RLS (Team Hub); Strategy-Hub invites broken |

**Mapping to the brief's roles:**
- *Platform owner* → super-admin (`is_super_admin=true`).
- *Administrator* → `profiles.role='ADMIN'`.
- *Workspace owner* → `workspace_members.role='owner'` (usually the account creator, workspace id = user id).
- *Viewer* → `viewer` in workspace/business/team-hub.
- *Manager, Sales representative, Marketing user, Content creator, Billing administrator* → **do not exist.** There is no functional/job-role RBAC. Every normal user is a `CLIENT` who owns their own workspace; there is no per-feature role that restricts a user to "only sales" or "only content," and no dedicated billing-admin role (any workspace owner manages billing).

## 2. Platform-role capability matrix

| Capability | GUEST | CLIENT (normal user) | ADMIN | Super-admin |
|---|---|---|---|---|
| Access portal (`/portal/*`) | — | ✅ (own data) | ✅ | ✅ |
| Access admin console (`/admin/*`) | — | ❌ | ✅ | ✅ |
| View/create/edit/delete **own** leads, campaigns, content | — | ✅ | ✅ | ✅ |
| Import / export leads | — | ✅ | ✅ | ✅ |
| Send email / run campaigns | — | ✅ (plan-limited) | ✅ | ✅ |
| Make VOIP calls | — | ✅ (credit-gated, dormant) | ✅ | ✅ |
| Manage integrations / sender accounts | — | ✅ (own) | ✅ | ✅ |
| Manage own billing / subscription | — | ✅ | ✅ | ✅ |
| Access **other users'** data | ❌ | ❌ (except via broken profile-PII leak, §5) | ✅ via admin RLS / support session | ✅ |
| Grant credits / change plans / edit entitlements | ❌ | ❌ | ✅ (`admin_*` RPCs) | ✅ |
| Edit global feature flags / prompts / pricing | ❌ | ❌ | ✅ | ✅ |
| View audit logs / all users | ❌ | ❌ | ✅ | ✅ |
| Time-boxed impersonation (support session) | ❌ | ❌ | ✅ (`support_sessions`) | ✅ |

**Admin gating is only PARTLY backend-enforced — with a critical hole.** Admin *read* RLS policies correctly use `is_admin()`. **But the `admin_*` write RPCs do NOT enforce admin identity:** they authorize on a **caller-supplied `p_admin_id`** (not `auth.uid()`) and are `EXECUTE`-granted to `anon`/`authenticated`, so any actor can pass a (publicly readable) admin UUID and grant credits / change plans / flip feature flags. **Admin write protection is effectively frontend-only. (P0 — BUG-037.)** Fix: authorize on `auth.uid()` and REVOKE from anon.

## 3. Workspace / Business role matrix (collaboration)

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| Read business/workspace data | ✅ | ✅ | ✅ | ✅ |
| Create/edit leads, campaigns, content in the business | ✅ | ✅ | ✅ | ❌ (read-only intended) |
| Edit `business_profiles` "brain" | ✅ | ✅ | ✅ (**any member — should be admin-only**) | ✅ (**gap**) |
| Update business settings, archive business | ✅ | ✅ | ❌ | ❌ |
| Add/remove members, change roles | ✅ | ✅ | ❌ | ❌ |
| Update workspace record | ✅ | ❌ | ❌ | ❌ |
| Delete business (hard) | not exposed in UI | — | — | — |

> Note: the `viewer` read-only intent is enforced by RLS on write policies for most tables, but a few tables (e.g. `business_profiles`) allow any member to write.

## 4. Team Hub (Flow) role matrix

Client matrix in `hooks/useFlowPermissions.ts` (cosmetic) **backed by** role-aware RLS on every `teamhub_*` table:

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| Delete flow/board | ✅ | ❌ | ❌ | ❌ |
| Manage members / lanes | ✅ | ✅ | ❌ | ❌ |
| Edit items / comment | ✅ | ✅ | ✅ | ❌ |
| View board | ✅ | ✅ | ✅ | ✅ |

## 5. Frontend-only checks & backend authorization gaps

**Backend-enforced (trustworthy):**
- Workspace/business/team-hub table access (RLS + guard functions).
- Admin *read* overrides (`is_admin()` RLS). **NOT** the admin *write* RPCs — see gap below.
- AI credit ceiling (`enforce_ai_proxy_quota`, service-role only) and monthly email cap (`start-email-sequence-run`).
- Privileged profile columns (role/is_super_admin/plan) via `enforce_profile_privileged_columns` trigger — blocks self-escalation.
- Public API (`v1-*`) auth via `api_keys` + idempotency + cross-workspace guard on PATCH.

**Frontend-only / bypassable (do NOT rely on for security):**
- `useFlowPermissions` UI gating (real RLS backs it, but the UI check itself is cosmetic).
- ProfilePage "API keys" (client-generated `af_` token in localStorage — **not a real credential**), 2FA (UI state only), account deletion (**fake — deletes nothing**), data export (mock).
- Onboarding completion flag (localStorage).
- Seat-limit check on team-invite accept (`useTeamInvites.ts`, client-side).
- Client-side credit checks (`consumeCredits`) — honest-client meter only.
- Client-supplied Stripe price/plan/credit amounts (see billing security findings — tampering risk).

**Authorization gaps found:**
- **P0 — admin RPCs callable by anyone:** `admin_*` RPCs trust a caller-supplied `p_admin_id` and are `EXECUTE`-granted to `anon` → any actor grants credits / changes plans / flips flags (BUG-037). **Most severe finding.**
- **P1 — `subscriptions` self-writable:** public INSERT `with_check=true` + UPDATE without WITH CHECK → users self-grant plan/credits.
- **P1 — `audit_logs` cross-tenant readable:** `USING(auth.uid() IS NOT NULL)` → any user reads all tenants' audit rows.
- **P0 — cross-tenant profile read:** `profiles` retains a legacy `SELECT USING (true)` policy for the `authenticated` role → any logged-in user can read every user's email, `businessProfile`, and `stripe_customer_id`.
- **P1 — team self-join:** `team_members` INSERT policy checks only `user_id = auth.uid()`; a user can insert themselves into an arbitrary `team_id` (accept path doesn't verify the invite belongs to them server-side).
- **P2 — Team Hub role escalation:** `teamhub_flow_members` UPDATE doesn't validate the target role; `owner` is blocked only in the UI.
- **P2 — self-serve feature flags:** any workspace member can INSERT/UPDATE `workspace_feature_flags` for their own workspace — fine for UX toggles, unsafe if any flag is meant to be a paid entitlement.
- **Webhook auth:** most Twilio webhook endpoints are unauthenticated (spoofable writes to `lead_call_logs`); Stripe webhook fails **open** when the secret is unset.

## 6. Sensitive-data access questions (from the brief)

| Question | Answer |
|---|---|
| Can a role access **other businesses**? | Within a workspace, business scoping is **not enforced when `multi_business` flag is off (default)** — queries fall back to the legacy per-user path, so a solo user sees only their own data, but the intended per-business isolation is inert. Cross-**workspace** access is blocked by RLS (except the profile-PII leak). |
| Can a user access **other users' leads**? | No via RLS (owner/business-member scoped) — **except** admins, active support sessions, and the profile-PII leak (profiles only, not leads). |
| Can a user view **private notes**? | Notes are not persisted at all (UI-only) — so there are no server-side private notes to protect or leak. |
| Export data? | Any user can CSV-export their own leads (client-side). No tenant-wide export controls; "data export" in settings is mock. |
| Manage integrations? | Any workspace owner/member manages their own; no separate integration-admin role. |
| Access AI knowledge? | AI memory is workspace-scoped (not business-scoped) — all members/businesses in a workspace share it. |
| View call recordings? | Anyone who can see the lead can see its `lead_call_logs.recording_url` (owner/business-member). No separate recording-access role. Recordings are dormant until Twilio is configured. |
| View campaign analytics? | Owner/business-member of the campaign; `campaign_variant_stats` RPC is owner-scoped (`auth.uid()`). |

## 7. Recommendations
1. **Remove the `profiles USING(true)` policy** (P0) — replace with own/co-member/admin.
2. **Introduce real job-function roles** (or explicitly drop the pretense) — the product markets teams/sales/marketing but has no functional RBAC; add role→capability mapping if multi-seat is a goal.
3. **Server-side team invite acceptance** (`SECURITY DEFINER accept_team_invite`) and move seat checks server-side.
4. **Tighten `business_profiles` writes to admins**, validate target role on Team Hub role changes, and decide whether `workspace_feature_flags` are user toggles or paid gates.
5. **Replace mock ProfilePage security features** (API keys, 2FA, deletion, export) with real implementations or remove them so users aren't misled about protections.

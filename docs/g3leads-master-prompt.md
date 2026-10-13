# Master Build Prompt — G3Leads (India SaaS CRM Platform) for Google Antigravity / Gemini 3

## How to use this document

> **Updated for the October 2026 web stack** (React 19.3, Vite 8, React Router 8,
> Tailwind 4, Hono 4, Drizzle, PostgreSQL 18, TypeScript 7, Vitest 5,
> Playwright 1.64). **Phase 0 is already built** in this repository; see the
> root `README.md` and `docs/architecture.md`. Start the agent at Phase 1.

Antigravity works best in **Planning Mode**: it turns a big prompt into a plan artifact + task list *before* touching code, then you review and approve before it executes. Don't dump this whole file into "Fast Mode" and walk away — treat it as a spec you feed in stages.

**Recommended flow:**
1. Open Antigravity → **Manager View** → New Task.
2. Paste **Section 1–10** (everything up to "Phased Delivery Plan") in **Planning Mode**. Let it produce an architecture plan + implementation.md artifact. Review it like a tech lead reviewing an RFC — check the data model and multi-tenancy approach especially closely before approving.
3. Once approved, tell it to execute **Phase 0 and Phase 1 only** (from Section 11).
4. After each phase, make it use the **Browser Subagent** to demo the feature back to you (screenshots/recording) before you move to the next phase.
5. Paste the next phase's block as a new task, referencing what's already built. Don't ask for everything in one giant execution run — large scope in one shot is where agentic IDEs tend to drift.
6. Replace any remaining generic references below with "G3Leads" if you rename it later.

Everything between the line `=== BEGIN PROMPT ===` and `=== END PROMPT ===` is meant to be pasted directly into Antigravity.

---

```
=== BEGIN PROMPT ===

ROLE
You are acting as a senior full-stack platform architect and engineering team.
Build G3Leads, a multi-tenant B2B SaaS CRM platform for the Indian market.
Work in Planning Mode first: produce an architecture doc and phased task list
before writing code. Confirm the plan before executing each phase.

PRODUCT VISION
G3Leads is not a rigid, fixed-schema CRM. It is a CRM *platform* — the
building blocks a technical team uses to assemble a CRM that fits their exact
sales/support process, and that can be reshaped in hours (not months) as the
business changes. Two reference products define the bar:
- Data-model flexibility & developer-first extensibility: like Twenty CRM's
  platform approach — custom objects, custom fields, workflow engine, and
  permissions defined as configuration, not hardcoded.
- Visual/interaction design: like Monday.com — colorful, multi-view boards
  (Table / Kanban / Calendar / Timeline / Chart), inline editing, drag-and-drop,
  and a fast command-palette-driven UX like Twenty CRM's.
Primary market: Indian SMBs and mid-market companies, so India-specific
communication and payment rails are first-class, not bolted on later.

─────────────────────────────────────────
1. TECH STACK (current as of October 2026 — pin exact versions)
─────────────────────────────────────────
- Runtime: Node.js 22 LTS (24 LTS once the team upgrades), ESM everywhere
- Monorepo: Turborepo 2.11 + pnpm 10 workspaces, Biome 2 for lint + format
  (replaces ESLint + Prettier), TypeScript 7 (native Go compiler, `tsc`)
  - apps/web         → React 19.3 + Vite 8 (Rolldown) + TypeScript (SPA, NOT
                        Next.js/SSR): tenant-facing app with the main login and
                        every role/position-based dashboard from Section 2
  - apps/admin       → a SEPARATE small React 19 + Vite 8 app for the
                        Super-Admin portal (platform team only), its own
                        deployable, not a route inside apps/web (see Section 2)
  - apps/api         → Hono 4 on Node (@hono/node-server) + @hono/zod-openapi:
                        typed routes, Zod 4 validation and an auto-generated
                        OpenAPI 3.1 spec with Scalar docs at /api/docs. A single
                        backend serving both apps/web and apps/admin
  - apps/worker      → background job processor (BullMQ 6 on Redis 8)
  - packages/db      → Drizzle ORM 0.45 + postgres.js on PostgreSQL 18; SQL
                        migrations own RLS policies, DB roles and SECURITY
                        DEFINER functions
  - packages/shared  → Zod schemas, permission catalogue and types shared by
                        the API and both frontends
  - packages/ui      → shared component library: Tailwind CSS 4 (CSS-first
                        @theme tokens) + Radix primitives (unified `radix-ui`
                        package) in the shadcn/ui style
  - packages/workflow-engine → automation/rules engine, usable standalone
  - packages/integrations    → one adapter per external service (see Section 7)
  - packages/sdk     → public TypeScript SDK for customers who want code-level
                        customization (mirrors the "define objects in code" model)
- Frontend routing/state: React Router 8 (data router, `createBrowserRouter`)
  with `<RequireRole>` guards per Section 2, TanStack Query 5 for server
  state, Zustand 5 for the client-side auth/session store, React 19 form
  actions (`useActionState`) for auth forms, i18next 26 for English + Hindi
- Database: PostgreSQL 18 (primary, with Row-Level Security), Redis 8 (cache,
  queues, rate limits)
- Search: Meilisearch or Typesense for instant record/global search
- Queues/Jobs: BullMQ 6 (Redis-backed) for async work: emails, WhatsApp sends,
  webhook delivery, report generation, workflow execution
- Realtime: WebSockets (Hono's WebSocket helper or Socket.IO) for live board
  updates and notifications
- Auth: `jose` 6 JWTs (HS256 now, EdDSA/KMS keys later): short-lived access
  tokens + rotating refresh tokens with reuse detection, stored as httpOnly
  Secure cookies (never localStorage); Argon2id password hashing
  (@node-rs/argon2); otplib 13 TOTP; email/password plus Google/Microsoft SSO
  and SAML for enterprise tenants. Full detail in Section 2
- File storage: S3-compatible (AWS S3 ap-south-1 Mumbai, or Cloudflare R2)
- Infra: Docker Compose for local dev; deployable to AWS (ap-south-1) or GCP
  (asia-south1) so primary data residency stays in India
- Observability: OpenTelemetry + Sentry for errors, structured logs (pino 10)
- Testing: Vitest 5 for unit/integration tests (against a real Postgres so
  RLS is exercised), Playwright 1.64 for E2E. Use the Browser Subagent to
  run these visually against the running app after each phase

─────────────────────────────────────────
2. MULTI-PORTAL AUTHENTICATION & ROLE-BASED ACCESS
─────────────────────────────────────────
There are three distinct access experiences. Build them as three explicitly
separate concerns — do not let them share a permission check path.

A) PLATFORM SUPER-ADMIN PORTAL (your own ops team, not tenant-visible)
  - Lives in apps/admin, served on its own subdomain (e.g. admin.g3leads.com).
  - Backed by a PlatformAdmin table that is completely separate from the
    tenant User table — a platform admin is never just "a user with a special
    role". This means a bug in tenant RBAC can never accidentally grant
    platform-admin rights, and vice versa.
  - Mandatory 2FA (TOTP) to log in; support an IP-allowlist option for extra
    hardening. JWTs issued for this portal use a distinct signing secret and
    a distinct "aud" (audience) claim, so a stolen/forged tenant token can
    never be replayed against a super-admin endpoint even if a role name
    happens to match.
  - Capabilities: create/suspend tenants, impersonate a tenant user for
    support (impersonation itself is always audit-logged), manage billing
    overrides and feature flags, view platform-wide health metrics.

B) TENANT MAIN LOGIN ("User main login")
  - One shared login screen in apps/web for every employee of a customer
    business — e.g. app.g3leads.com/login, with the tenant resolved either by
    subdomain ({tenant}.g3leads.com) or by looking up the email's domain.
  - Supports email/password and Google/Microsoft SSO. This is the ONLY login
    surface regular users ever see — there is no second "position login"
    screen; position/role instead determines what they land on after this.
  - On success, the API issues a JWT whose payload carries user_id, org_id,
    role_id, and position — the frontend never decides identity, it only
    reads these claims to decide what to render.

C) POSITION/ROLE-BASED ROUTING (what happens right after B's login)
  - Every tenant User has a Role (permission level, e.g. Org Admin, Sales
    Manager, Sales Executive, Support Agent, Finance/Billing Viewer) and can
    optionally carry a human-readable Position/Department label for org-chart
    and reporting purposes. Role drives permissions; Position is what shows
    in the UI and can be fully customized per tenant via the Customization
    Engine (Section 4) the same way any other picklist field is.
  - Suggested default landing routes by role — make this table itself
    tenant-configurable, not hardcoded:
      • Org Owner/Admin   → /admin console: user management, customization
        engine, billing, integration settings
      • Sales Manager/Lead → /team dashboard: team-wide pipeline, reports,
        lead reassignment tools
      • Sales Executive/Rep → /my-workspace: only their own leads/deals/tasks
      • Support/Ops        → /inbox: ticket & conversation-focused view
      • Finance/Billing     → /invoicing: invoices, payments, GST reports
  - Implementation notes:
    - React Router 8: wrap protected routes in a `<RequireRole permission="...">`
      component that reads the decoded JWT/session from a central AuthContext
      (or Zustand store) and redirects unauthorized access — but treat this
      purely as UX, never as the security boundary.
    - The backend MUST independently re-check permission on every single API
      call regardless of what the frontend route allowed the user to reach.
      A hidden button or a manually-typed URL should never expose data the
      role doesn't permit — verify this with an automated test per role.
    - Keep Role and Permission fully data-driven (Section 4's Role/Permission
      entities), so a tenant admin can invent a new position like "Regional
      Sales Head" with a custom permission set without an engineer touching code.

─────────────────────────────────────────
3. ARCHITECTURE PRINCIPLES
─────────────────────────────────────────
- True multi-tenancy: every table carries a tenant_id (organization_id); enforce
  isolation with PostgreSQL Row-Level Security, not just application-layer filters.
- API-first: every UI action must go through a documented internal API
  (REST or GraphQL — pick one and be consistent). Auto-generate OpenAPI docs.
- Event-driven core: record create/update/delete emits internal domain events.
  The workflow engine, audit log, search indexer, and webhook dispatcher all
  subscribe to this event bus — do not hardcode side effects into controllers.
- Extensibility over configuration-only: expose a TypeScript SDK so technical
  teams can define custom objects, fields, and serverless functions in code
  and ship them through normal git/CI, in addition to an in-app no-code UI for
  non-technical admins. Both paths write to the same underlying schema.
- Everything permissioned: no feature ships without a permission check at the
  object, field, and record level.

─────────────────────────────────────────
4. CORE DATA MODEL — THE CUSTOMIZATION ENGINE
─────────────────────────────────────────
This is the heart of the product. Model it explicitly, don't bolt it on later.

Foundational entities:
- PlatformAdmin — intentionally separate from Organization/User (Section 2A);
  its own table, its own auth, never joins into tenant-scoped queries.
- Organization (tenant), Workspace, User, Team, Role, Permission, Position
  (a tenant-customizable label like "Sales Executive" or "Regional Sales
  Head" shown in the UI and org chart; Role is what actually drives
  permission checks — see Section 2C for how these two connect)
- CustomObject (e.g. "Deal", "Contact", or a user-defined object like "Property"
  for a real-estate business) — every standard object (Contact, Company, Deal)
  should itself be an instance of CustomObject, not a special case.
- CustomField — field types must include at minimum:
  text, long_text, number, currency (INR default, multi-currency capable),
  date, datetime, boolean, single_select, multi_select, email, phone, url,
  relation (1:1, 1:many, many:many to another object), formula, rollup,
  lookup, file/attachment, rich_text, and a "person"/user reference type.
- View — Table, Kanban (grouped by any select/status field), Calendar,
  Timeline/Gantt, Chart/Dashboard widget, Map (for field-sales use cases).
  Views must support filters, sorts, grouping, and saved/shared view configs.
- Layout — customizable record detail-page layout (which fields/sections show).
- Pipeline & Stage — one or more sales pipelines per object, stage probability,
  stage-entry/exit automations.
- Workflow/Automation — trigger (record created/updated/field changed/time-based/
  webhook received) → condition(s) → action(s) (send email, send WhatsApp,
  create task, update field, call webhook, run serverless function, notify user).
  Ship this as a visual builder AND allow raw code (serverless function) actions.
- AuditLog — every field change on every record, who/when/old value/new value.
- Webhook — outbound (tenant-configured, signed payloads) and inbound
  (tenant-specific ingest URLs for integrations/automation platforms).
- ApiKey / OAuth App — for programmatic access and a future integration
  marketplace.

Ship an admin UI where a non-developer can create a new Custom Object with
fields, a default table+kanban view, and a workflow — no code required — while
a developer can define the exact same thing via the SDK in version control.

─────────────────────────────────────────
5. CORE CRM MODULES (default objects built on the engine above)
─────────────────────────────────────────
- Leads (with capture from web forms, ads, WhatsApp, email-to-lead) and
  lead-to-contact/company conversion
- Contacts & Companies/Accounts with relationship mapping
- Deals/Opportunities with multiple pipelines, weighted forecasting
- Activities: tasks, calls, meetings, notes, timeline of all interactions
- Unified Inbox: email + WhatsApp + SMS threads attached to the right record
- Documents: quotes, proposals, e-signature-ready PDF generation
- Products & Price Books
- Invoicing (see India compliance below) and payment tracking
- Reports & Dashboards: drag-and-drop widgets, pipeline funnel, activity
  leaderboards, revenue forecasts, exportable to PDF/Excel
- Team inbox/notifications, @mentions, comment threads on any record
- Lead assignment & routing: round-robin, territory-based, or workload-based
  auto-assignment rules so new leads never sit unclaimed
- Duplicate detection & merge: fuzzy-match on phone/email/company name, with
  one-click merge and field-conflict resolution
- Email sequences/cadences: multi-step automated email + task cadences with
  reusable templates and merge fields
- Meeting scheduling links: Calendly-style booking pages tied to a rep's
  calendar availability, auto-logged to the contact timeline

─────────────────────────────────────────
6. INDIA-SPECIFIC REQUIREMENTS (do not treat as optional/later)
─────────────────────────────────────────
- GST-compliant invoicing: GSTIN capture per org/customer, HSN/SAC codes,
  CGST/SGST/IGST auto-calculation based on buyer/seller state, GST e-invoice
  (IRN + QR code) generation flow, TDS tracking fields on invoices.
  ⚠ Flag clearly in generated docs that GST/e-invoicing logic must be reviewed
  by a CA/tax professional before production use — do not treat AI-generated
  tax logic as compliance-certified.
- Currency: INR as default; multi-currency support for exporters.
- Data residency: primary database and file storage in an India region
  (AWS ap-south-1 / GCP asia-south1), configurable per enterprise tenant.
- DPDP Act 2023 alignment: explicit consent capture on lead forms, data
  subject access/delete request workflow, configurable data retention policy,
  breach-notification-ready audit trail. Note in docs that this needs legal
  sign-off, same caveat as GST above.
- Communication channels native to India:
  - WhatsApp Business API via a pluggable adapter (Meta Cloud API directly,
    or BSPs like Interakt / Gupshup / 360dialog / AiSensy) — two-way chat,
    template messages, media, and delivery/read receipts synced to the record.
  - SMS/OTP via MSG91 / Gupshup / Twilio adapters.
  - Click-to-call / IVR telephony via Exotel / Knowlarity / Ozonetel / Servetel
    adapters, with call recording attached to the contact timeline.
- Payments: Razorpay / Cashfree / PayU / Instamojo adapters for both
  (a) collecting customer payments against invoices via UPI/cards/netbanking,
  and (b) billing your own SaaS subscribers (see Section 8).
- Accounting sync: Tally (via Tally XML/ODBC connector), Zoho Books, QuickBooks
  India — two-way sync of invoices/customers where feasible.
- India-specific lead sources: native connectors for IndiaMART, TradeIndia,
  Sulekha, and JustDial lead feeds — these are often bigger inbound-lead
  channels than Meta/Google Ads for Indian SMBs and B2B sellers, don't treat
  paid social/search as the only source worth integrating.
- Missed-call marketing/lead capture: support the common India pattern of a
  toll-free "give a missed call to enquire" number (via Exotel/Knowlarity/
  MyOperator) that auto-creates a lead and triggers a callback or WhatsApp follow-up.
- Optional eKYC module: DigiLocker/Aadhaar-based eKYC for onboarding customers
  in regulated flows (financial services, real estate) — keep this pluggable,
  not a core dependency, since most tenants won't need it.
- Localization: i18n framework from day one; ship English + Hindi first,
  structure translations so regional languages can be added without code changes.

─────────────────────────────────────────
7. INTEGRATION ECOSYSTEM
─────────────────────────────────────────
Build every integration as an adapter implementing a common interface in
packages/integrations, not ad-hoc code in controllers, so new ones are cheap
to add. Cover:
- Email: Gmail & Outlook OAuth two-way sync, generic IMAP/SMTP
- Calendar: Google Calendar, Outlook Calendar (meeting scheduling links)
- Communication: WhatsApp, SMS, Voice/IVR (Section 6), transactional email (SES/SendGrid)
- Payments/Billing: Razorpay & Stripe (see Section 8), India gateways (Section 6)
- Automation/no-code: native Zapier app + Make.com app, generic inbound/outbound
  webhooks, a documented public REST API with API keys and OAuth2 for third-party developers
- Marketing/lead sources: Meta Lead Ads, Google Ads lead form sync, LinkedIn Lead Gen
- E-commerce: Shopify & WooCommerce (order/customer → CRM lead sync)
- Accounting: Tally / Zoho Books / QuickBooks (Section 6)
- AI layer: a model-agnostic "AI Provider" interface (don't hardcode one vendor)
  so a tenant can plug in the LLM provider of their choice for: lead scoring,
  auto-drafted follow-up emails and WhatsApp replies, call/meeting transcription
  and summarization, and "next best action" suggestions on a deal.
- SSO: Google Workspace, Microsoft 365, and SAML 2.0 for enterprise tenants.

─────────────────────────────────────────
8. MULTI-TENANT SAAS LAYER
─────────────────────────────────────────
- Subscription plans/tiers (e.g. Starter/Growth/Enterprise) with feature flags
  and usage limits (seats, records, automation runs, WhatsApp messages/month)
  enforced centrally, not scattered across features.
- Billing via Razorpay Subscriptions or Stripe Billing; invoices to your own
  customers generated automatically; usage metering pipeline for overage billing.
- Super-admin portal: see Section 2A for the full design (separate app,
  separate PlatformAdmin auth, mandatory 2FA, audit-logged impersonation).
- White-label option: custom domain, logo, and color theme per tenant for
  agencies/resellers who want to resell the CRM under their own brand.

─────────────────────────────────────────
9. SECURITY, PERMISSIONS & COMPLIANCE
─────────────────────────────────────────
- RBAC with custom roles + field-level and record-level permission overrides
  (e.g. "Sales Rep can see all deals in their team but only edit their own").
- 2FA (TOTP) for all users; SSO/SAML for enterprise as above.
- Full audit log (Section 4) exposed to admins with filtering/export.
- Encryption at rest and in transit; secrets in a proper vault, never in env
  files committed to git.
- Rate limiting and abuse protection on all public API endpoints.
- Automated backups with tested restore procedure; document RPO/RTO targets.

─────────────────────────────────────────
10. ADDITIONAL BUILDING BLOCKS (GROWTH & ECOSYSTEM)
─────────────────────────────────────────
Treat these as backlog items for after the MVP proves out, not blockers for
Phase 0-3 — but design the architecture so none of them require a rewrite later:
- Data import/export & migration tools: CSV/Excel/Google Sheets import wizard
  with field-mapping, plus ready-made importers from Zoho CRM, HubSpot, and
  Salesforce so switching to G3Leads isn't a manual data-entry project.
- Mobile app: React Native (iOS/Android) or an installable PWA, with offline
  mode and a local sync queue for field-sales reps working with patchy connectivity.
- E-signature integration: DocuSign, Zoho Sign, or an Aadhaar-based Indian
  eSign provider for quotes and contracts.
- Lightweight helpdesk/ticketing module (optional): keeps post-sale support
  tickets linked to the same contact/company record instead of living in a
  separate tool.
- Sales gamification: leaderboards, streaks, and goal tracking to drive rep adoption.
- NPS/customer feedback surveys triggered automatically at deal milestones.
- Website chatbot / lead-capture widget: an embeddable script that creates a
  Lead record directly from site-visitor conversations.
- Third-party app marketplace: let outside developers publish integrations
  built on the public SDK/API (Sections 4 & 7) — the same way Twenty CRM and
  Salesforce grew ecosystems around their platforms.
- Accessibility: WCAG 2.1 AA compliance audit before general availability.
- Per-tenant sandbox/staging environment: lets admins test a new workflow or
  field change against sample data before it touches live records.
- API rate limiting & quotas tied to plan tier, enforced at the gateway layer,
  not per-endpoint ad hoc.

─────────────────────────────────────────
11. PHASED DELIVERY PLAN
─────────────────────────────────────────
Execute in this order. Do not start a phase until the previous one has a
working, demoable build verified via the Browser Subagent.

PHASE 0 — Foundations
  - Monorepo scaffold (apps/web, apps/admin, apps/api), CI pipeline, Docker
    Compose local dev
  - Tenant auth in apps/web: signup/login, org creation, invite teammates,
    RBAC skeleton (Role + Position entities from Section 4)
  - Super-admin auth in apps/admin: separate PlatformAdmin login with 2FA,
    wired to its own JWT audience per Section 2A
  - Role/position-based post-login routing in apps/web: at least 3 distinct
    landing dashboards (Org Admin, Sales Manager, Sales Rep) behind
    `<RequireRole>` route guards, with matching backend permission checks
  - Base Postgres schema with Row-Level Security proven working across 2 test tenants
  Done when: two isolated test orgs can sign up, invite users, and cannot see
  each other's data (prove with an automated test, not just manual check);
  AND a super-admin login on apps/admin cannot authenticate against apps/web's
  tenant endpoints or vice versa; AND three different roles logging in via the
  same tenant login page land on three different dashboards with permissions
  enforced server-side.

PHASE 1 — Core CRM MVP
  - Contacts, Companies, Deals with one pipeline, Tasks/Notes/Activities
  - Table view + Kanban view with drag-and-drop stage changes
  - Global search, basic dashboard with 3-4 key widgets
  Done when: a user can create a contact, convert it through a pipeline to
  "won", and see it reflected on a dashboard.

PHASE 2 — Customization Engine
  - Custom Object/Field/View builder (admin UI) fully working end-to-end
  - Workflow/automation builder (trigger → condition → action) with at least
    3 real actions wired up (send email, create task, update field)
  - Public TypeScript SDK stub that can define one custom object in code
  Done when: a non-developer can create a brand-new object with custom fields
  and a working automation without touching code.

PHASE 3 — India Communication & Payments
  - WhatsApp Business adapter (send/receive, template messages, timeline sync)
  - SMS/OTP adapter, click-to-call adapter (pick one telephony provider first)
  - Razorpay/Cashfree integration for invoice payment collection
  - GST-compliant invoice generator (with the compliance caveat noted)
  Done when: a WhatsApp message sent to a lead's number shows up on their
  contact timeline, and an invoice can be generated and paid via a payment link.

PHASE 4 — Automation, AI & Reporting
  - Full workflow engine with time-based triggers and webhook actions
  - AI provider abstraction wired to at least one real LLM for email drafting
    and lead summarization
  - Advanced reports/dashboards, exportable

PHASE 5 — SaaS Billing, Admin & Hardening
  - Subscription plans, Razorpay/Stripe billing, usage metering
  - Super-admin panel, white-label theming
  - Security hardening pass, load testing, backup/restore drill, docs site

PHASE 6 — Growth & Ecosystem (optional, post-launch, prioritize by user demand)
  - Data import/migration wizard (Zoho/HubSpot/Salesforce/CSV/Google Sheets)
  - Mobile app or offline-capable PWA for field sales reps
  - Public developer portal + app marketplace foundations
  - E-signature integration, website chatbot widget, gamification/NPS surveys

For each phase, produce: updated architecture notes, passing tests, seed data,
and a short demo (screenshots or recording via the Browser Subagent).

=== END PROMPT ===
```

---

## Notes for you as the founder (not part of the pasted prompt)

- **On "React JS":** I read this as a plain React 19 SPA (Vite 8) with a separate
  Node.js API (Hono), rather than Next.js — that's the more common setup when people
  say "React" specifically, and it's a very standard, valid choice (it's
  basically the MERN pattern most Indian dev teams already know). One
  trade-off to be aware of: you lose Next.js's built-in server-side rendering,
  so if SEO for a public marketing site matters later, build that marketing
  site as a separate, simple static site rather than trying to SEO the
  logged-in app itself — logged-in CRM screens don't need SSR anyway.
- **Why apps/admin is a separate app, not just an `/admin` route in apps/web:**
  a route guard is a UI convenience, not a security wall — if the super-admin
  UI shipped inside the same React bundle as the tenant app, a single XSS bug
  or a misconfigured guard in the tenant code could expose platform-wide
  controls. Shipping it as a genuinely separate deployable (own build, own
  domain, own auth) means a compromise of one can't reach the other. If that
  feels like overkill for a v1 with just you and a co-founder as admins, it's
  fine to fold it into apps/web behind a role check *temporarily* — just plan
  to split it out before you have paying customers, not after an incident.
- **Pick your battles for v1.** Everything above is the full enterprise scope — realistically, ship Phases 0–3 as your actual MVP and validate with real users before building the AI layer and white-labeling in Phase 4–5.
- **GST and DPDP compliance are legal/tax matters, not just engineering ones.** Antigravity (or any AI agent) can wire up the *mechanics* of GST invoicing and consent flows, but have a CA and a lawyer sign off on the actual logic before you invoice real customers or handle real personal data — I'm flagging this as a builder, not as legal or tax advice.
- **Don't paste the whole thing into Fast Mode.** Antigravity's Planning Mode exists specifically so you can catch a bad multi-tenancy or data-model decision *before* 10,000 lines get written on top of it — that review step matters most for Section 4 (Customization Engine), Section 3 (multi-tenancy), and the new Section 2 (multi-portal auth), since everything else depends on those being right.
- **Reuse the phase blocks as separate follow-up prompts.** Once Phase 0 is verified working, your next message to Antigravity can just be "Foundations are done and verified. Now execute Phase 1 from the spec: [paste Phase 1 block]" — this keeps each agent run scoped and reviewable.

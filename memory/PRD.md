# VisaScout — Product Requirements Document

## Original Problem Statement
Build VisaScout, a global visa requirements assistant (web + mobile). Users enter nationality/passport, country of residence, destination country, and purpose of travel (tourism/work/study/business/family/transit). The backend runs a LIVE web search of official government/embassy sources (.gov domains, immigration portals) for that exact combination — never from model memory. Each lookup returns: visa category + requirements, a 5-category document checklist (Identity, Financial, Purpose-specific, Health/Biometric, Other) as collapsible cards with checkboxes, 3–5 common rejection reasons, current processing time and fee (each with source URL + date checked), direct links to the official portal + all sources, and a Sources transparency panel. Guardrails: flag ambiguity and recommend professional consultation, never guarantee approval, never fabricate fees/times. Save searches to the user's account (timestamped, re-runnable). Add-ons: first-use disclaimer, PDF export of checklist, Resend email notifications for outdated searches.

## Architecture
- **Frontend:** React 19 (CRA + craco), Tailwind, shadcn/ui, react-router, sonner. "Official document" theme (Playfair Display + IBM Plex Sans/Mono; bone-white + forest-green + rust warning).
- **Backend:** FastAPI, all routes under `/api`. MongoDB via motor.
- **Auth:** email + password, bcrypt hashing, JWT bearer tokens (localStorage `vs_token`). Seeded demo account.
- **AI/live search:** Claude Sonnet 5 via the Anthropic API directly (`anthropic` SDK + hosted `web_search_20260209` tool, authenticated with `ANTHROPIC_API_KEY`). Returns structured JSON per a strict schema with guardrail fallback.
- **Async jobs:** `/api/visa/lookup` and `/rerun` create a `processing` search and run the live search in a background task (`asyncio.create_task`) to avoid the 60s Cloudflare gateway timeout; frontend polls `GET /api/visa/searches/{id}` every 3s until `done`/`error`.

## User Personas
- **Traveller / applicant:** wants a trustworthy, source-cited answer on what visa they need and what to prepare.
- **Frequent flyer / relocator:** saves and re-runs searches, exports checklists, wants alerts when info is stale.

## Core Requirements (static)
- Live official-source search only; cited + dated sources on every result.
- 5-category checklist with checkboxes; rejection reasons; processing time + fee with sources; portal links; sources panel.
- Honest guardrails (ambiguity → consult professional; no guaranteed approval; no fabricated figures).
- Accounts with timestamped, re-runnable saved searches.

## Implemented (2026-06)
- ✅ Email+JWT auth, seeded demo account (`demo@visascout.app` / `Demo1234!`).
- ✅ First-use disclaimer gate.
- ✅ Async live visa lookup (Claude Sonnet 5 + web search) → structured JSON, saved & timestamped.
- ✅ Result UI: visa category, requirements, 5 collapsible checklist cards w/ checkboxes, rejection reasons, processing/fee cards with source badges + dates, portal link, sources transparency panel, ambiguity warning banner.
- ✅ Dashboard of saved searches (processing/outdated states), delete, re-run.
- ✅ PDF export of checklist (reportlab).
- ✅ Resend email-notify endpoint (wired; returns 503 until `RESEND_API_KEY` set) + settings toggle.
- ✅ Tested end-to-end: backend 17/17 pass, frontend flows 100%.

## Backlog / Remaining
- **P1:** Provide `RESEND_API_KEY` + verified sender to enable real outbound emails; add a scheduled job to auto-email outdated searches for users who opted in.
- **P2:** Status watchdog to fail `processing` searches stuck across a backend restart.
- **P2:** Country/nationality autocomplete dropdowns.
- **P2:** Streaming progress of the live search instead of a spinner.

## Next Tasks
- Wire Resend key when user supplies it; add scheduled outdated-search notifier.
- Optional: autocomplete inputs, share/print view.

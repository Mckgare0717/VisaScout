# VisaScout

**Know exactly what visa you need.** VisaScout is a global visa-requirements assistant: enter your passport, country of residence, destination and purpose of travel, and it runs a live search of official government and embassy sources, then returns a structured answer — visa category, a 5-category document checklist, fees and processing times with source links, common rejection reasons, and full source citations with access dates.

- **Live official-source search** — every lookup queries real government/immigration sites at request time; nothing is answered from model memory.
- **Honest guardrails** — ambiguous or unverifiable cases are flagged with a "consult a professional" warning; approval is never promised.
- **Exports & freshness** — results export to PDF, can be re-run against live sources, and are flagged when they're more than 30 days old.

## Architecture

| Part | Stack | Path |
|---|---|---|
| Backend | FastAPI + MongoDB (Motor), LLM lookups via Gemini (default, free tier) or the Anthropic API — switchable with `LLM_PROVIDER` | `backend/` |
| Frontend | React (CRA + CRACO), Tailwind, shadcn/ui | `frontend/` |

## Backend setup

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # POSIX: source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

Minimal `backend/.env` for local dev (Mongo can be a local `mongod` or Atlas):

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=visascout_dev
JWT_SECRET=dev-secret-change-me
LLM_PROVIDER=gemini
GEMINI_API_KEY=...                 # only needed to run live visa lookups
APP_URL=http://localhost:3000
# Stripe test keys — only needed to exercise Pro upgrade / the £3 form payment
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...    # from `stripe listen --forward-to localhost:8001/api/billing/webhook`
```

Without `RESEND_API_KEY`, a password-reset request logs the reset link to the
backend console — copy it from there in local dev.

### Environment variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URL` | yes | MongoDB connection string |
| `DB_NAME` | yes | Database name |
| `JWT_SECRET` | yes | Secret for signing access tokens |
| `LLM_PROVIDER` | no | Which model runs the live lookups: `gemini` (default — free tier, good for testing) or `anthropic` (production) |
| `GEMINI_API_KEY` | with `gemini` | Google AI API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) — Gemini + Google Search grounding |
| `GEMINI_MODEL` | no | Gemini model for lookups (default `gemini-2.5-flash`) |
| `ANTHROPIC_API_KEY` | with `anthropic` | Anthropic API key ([console.anthropic.com](https://console.anthropic.com)) — Claude + web search |
| `ANTHROPIC_MODEL` | no | Claude model for lookups (default `claude-sonnet-5`) |
| `CORS_ORIGINS` | prod | Comma-separated allowed frontend origins. Unset/`*` = wildcard **without** credentials (cookie auth disabled) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | If **both** are set, an admin account is seeded at startup. No defaults — omitting them means no admin is created |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | no | Demo account seeded at startup for internal use. Change these from the defaults on any deploy real users can reach — the account still exists even when the frontend doesn't advertise it (see `REACT_APP_SHOW_DEMO` below) |
| `RESEND_API_KEY` / `SENDER_EMAIL` | no | Enables outbound email (outdated-search notices, feedback, password-reset links, form PDFs) via Resend. Without it, feedback is still stored in MongoDB and reset links are written to the server log instead of emailed |
| `FEEDBACK_EMAIL` | no | Where the in-app feedback form delivers (default `xanretech@gmail.com`) |
| `EMERGENT_SESSION_URL` | no | Override for the Emergent Google-auth session exchange endpoint |
| `APP_URL` | prod | Frontend origin (e.g. `https://visascout.app`), no trailing slash. Used for password-reset links and Stripe return URLs. Also read by `billing.py` |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | for payments | Stripe subscription (Pro) **and** the one-off Schengen-form payment. All share one webhook at `/api/billing/webhook` |
| `SCHENGEN_FORM_PRICE_PENCE` / `SCHENGEN_FORM_CURRENCY` | no | One-off price for a completed Schengen form PDF (default `300` / `gbp` = £3) |

## Frontend setup

```bash
cd frontend
yarn install
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start
```

`REACT_APP_SHOW_DEMO=true` (optional) shows the "Try the demo account" button and pre-fills the demo login — **off by default**, and CRA bakes this in at build time, so it must be set before `yarn build`/`yarn start`, not just on the running server. Leave it unset on any deploy real users can reach.

`REACT_APP_BACKEND_URL` must point at the backend origin (no trailing slash); the client calls `<REACT_APP_BACKEND_URL>/api/...`.

## Keeping the Render backend warm

Render's free web service sleeps after ~15 min idle, so the next visitor eats a
~50 s cold start ("the server takes forever to load"). Two layers guard against it:

1. **`.github/workflows/keep-warm.yml`** — pings `/api/` every 10 min. GitHub cron
   slips 5–15 min under load, so this is a backup, not a guarantee.
2. **External monitor (do this)** — free account at
   [cron-job.org](https://cron-job.org): add a job hitting
   `https://visascout-api.onrender.com/api/`, method GET, **every 1 minute**,
   expected status `200`. That keeps the instance warm around the clock.
   (UptimeRobot works too but its free tier is 5-min, which still allows a sleep.)

The real fix is Render's **Starter plan ($7/mo)** — the instance never sleeps.
Switch to it if cold starts still bite after the monitor is in place.

## Tests

`backend/tests/backend_test.py` is an end-to-end regression suite that runs against a **deployed** backend:

```bash
REACT_APP_BACKEND_URL=https://your-backend.example.com pytest backend/tests
```

The live-lookup tests poll for up to ~3 minutes while the background web search completes.

## Disclaimer

VisaScout is informational only and not legal advice. Requirements change without notice — always verify with the relevant official authority before applying.

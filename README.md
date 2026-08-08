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
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

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
| `DEMO_EMAIL` / `DEMO_PASSWORD` | no | Demo account seeded at startup (defaults to the public demo credentials shown on the landing page) |
| `RESEND_API_KEY` / `SENDER_EMAIL` | no | Enables outdated-search email notifications via Resend |
| `EMERGENT_SESSION_URL` | no | Override for the Emergent Google-auth session exchange endpoint |

## Frontend setup

```bash
cd frontend
yarn install
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start
```

`REACT_APP_BACKEND_URL` must point at the backend origin (no trailing slash); the client calls `<REACT_APP_BACKEND_URL>/api/...`.

## Tests

`backend/tests/backend_test.py` is an end-to-end regression suite that runs against a **deployed** backend:

```bash
REACT_APP_BACKEND_URL=https://your-backend.example.com pytest backend/tests
```

The live-lookup tests poll for up to ~3 minutes while the background web search completes.

## Disclaimer

VisaScout is informational only and not legal advice. Requirements change without notice — always verify with the relevant official authority before applying.

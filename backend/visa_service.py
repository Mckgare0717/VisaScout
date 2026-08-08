import os
import json
import logging
from datetime import datetime, timezone

from anthropic import AsyncAnthropic
from google import genai
from google.genai import types as genai_types

logger = logging.getLogger(__name__)

# Which LLM backend runs the live lookups. "gemini" (default) uses Google's
# free-tier-friendly API for testing; "anthropic" is the production path.
def _provider() -> str:
    return os.environ.get("LLM_PROVIDER", "gemini").strip().lower()

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
ANTHROPIC_WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search", "max_uses": 6}
# Anthropic's server-side web search runs in an API-side loop that can pause
# with stop_reason "pause_turn"; cap how many times we resume it.
MAX_CONTINUATIONS = 5

# Clients are lazy so the module imports cleanly before the env file is loaded,
# and a missing key fails the lookup (visible in the UI) rather than boot.
_anthropic_client = None
_gemini_client = None


def _get_anthropic_client() -> AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _anthropic_client


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _gemini_client

PURPOSE_LABELS = {
    "tourism": "Tourism / Visit",
    "work": "Work / Employment",
    "study": "Study / Student",
    "business": "Business",
    "family": "Family / Spouse / Dependent",
    "transit": "Transit",
}

SCHEMA = """{
  "found_reliable_source": boolean,        // true only if you found official/credible sources for this exact pairing
  "ambiguous": boolean,                    // true if rules are contested, unclear, or you are not confident
  "consult_professional": boolean,         // true if the user should consult an immigration professional
  "warning_message": string | null,        // shown in a prominent warning banner when ambiguous/consult_professional is true
  "visa_required": boolean,                 // whether a visa is required at all for this pairing/purpose
  "visa_category": string,                  // e.g. "B-2 Tourist Visa", "Schengen Short-Stay (Type C)", or "Visa-free (up to 90 days)"
  "requirements_summary": string,           // 2-4 sentence plain-language summary from official sources only
  "checklist": {
    "identity": [ { "item": string, "detail": string } ],
    "financial": [ { "item": string, "detail": string } ],
    "purpose_specific": [ { "item": string, "detail": string } ],
    "health_biometric": [ { "item": string, "detail": string } ],
    "other": [ { "item": string, "detail": string } ]
  },
  "rejection_reasons": [ string ],          // 3-5 common rejection reasons for THIS nationality/destination pairing, only if found in sources; else []
  "processing_time": { "value": string, "source_url": string, "date_checked": "YYYY-MM-DD" } | null,
  "fee": { "value": string, "source_url": string, "date_checked": "YYYY-MM-DD" } | null,
  "application_portal_url": string | null,  // the official online application portal
  "sources": [ { "url": string, "title": string, "access_date": "YYYY-MM-DD" } ]  // EVERY official source page you used
}"""


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def build_system_prompt() -> str:
    return f"""You are VisaScout, a meticulous visa-requirements research assistant.

You MUST use your web search tool to find CURRENT information from OFFICIAL government and embassy sources
(.gov domains, official immigration/foreign-ministry portals, official embassy/consulate sites, and official
visa application portals such as vfsglobal only when it is the officially designated processor). Visa rules
change frequently, so NEVER answer from memory. Prefer the destination country's official immigration authority
and the destination's embassy/consulate for the applicant's nationality.

HARD GUARDRAILS (must enforce):
- If requirements are ambiguous, contested, or you cannot find a reliable official source: set "found_reliable_source"
  to false (or "ambiguous" to true), set "consult_professional" to true, and write a clear "warning_message"
  recommending professional consultation. DO NOT guess or fabricate.
- NEVER state that visa approval is guaranteed.
- NEVER fabricate fees or processing times. Only report figures explicitly confirmed by a source, and attach that
  source_url and the date_checked ({_today()}). If a fee or processing time is not found, set that field to null.
- Only include rejection_reasons that are supported by official or credible sources; otherwise return an empty array.
- Every URL you rely on MUST appear in the "sources" array with its access_date.

Today's date is {_today()}. Use it for all "date_checked" and "access_date" fields.

After you finish searching, respond with ONLY a single valid JSON object matching EXACTLY this schema
(no markdown, no code fences, no commentary before or after):

{SCHEMA}
"""


def _extract_json(text: str) -> dict:
    if not text:
        raise ValueError("Empty response from model")
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1] if t.count("```") >= 2 else t
        if t.lstrip().startswith("json"):
            t = t.lstrip()[4:]
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response")
    return json.loads(t[start:end + 1])


async def _lookup_via_anthropic(query: str) -> str:
    client = _get_anthropic_client()
    messages = [{"role": "user", "content": query}]
    response = None
    for _ in range(MAX_CONTINUATIONS):
        response = await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=16000,
            system=build_system_prompt(),
            tools=[ANTHROPIC_WEB_SEARCH_TOOL],
            messages=messages,
        )
        if response.stop_reason != "pause_turn":
            break
        # The API detects the trailing server-tool block and resumes the search.
        messages.append({"role": "assistant", "content": response.content})

    return "".join(block.text for block in response.content if block.type == "text")


async def _lookup_via_gemini(query: str) -> str:
    client = _get_gemini_client()
    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=query,
        config=genai_types.GenerateContentConfig(
            system_instruction=build_system_prompt(),
            # Google Search grounding — Gemini's server-side web search.
            tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
            max_output_tokens=16000,
        ),
    )
    return response.text or ""


async def run_visa_lookup(nationality: str, residence: str, destination: str, purpose: str,
                          search_id: str | None = None) -> dict:
    purpose_label = PURPOSE_LABELS.get(purpose, purpose)
    query = (
        f"I hold a passport from {nationality}. I currently reside in {residence}. "
        f"I want to travel to {destination} for the purpose of: {purpose_label}. "
        f"Research the current official visa requirements for this exact pairing and return the JSON object."
    )

    provider = _provider()
    if provider == "anthropic":
        content = await _lookup_via_anthropic(query)
    elif provider == "gemini":
        content = await _lookup_via_gemini(query)
    else:
        raise ValueError(f"Unknown LLM_PROVIDER '{provider}' — expected 'gemini' or 'anthropic'")

    try:
        data = _extract_json(content)
    except Exception as e:
        logger.error("Failed to parse visa JSON for %s (provider=%s): %s -- raw: %s",
                     search_id, provider, e, content[:500])
        # Guardrail fallback: never guess
        data = {
            "found_reliable_source": False,
            "ambiguous": True,
            "consult_professional": True,
            "warning_message": (
                "We could not reliably determine the visa requirements for this combination right now. "
                "Please consult the destination country's official immigration authority or a licensed "
                "immigration professional before making any travel decisions."
            ),
            "visa_required": True,
            "visa_category": "Unable to determine",
            "requirements_summary": "No reliable official source could be confirmed for this request.",
            "checklist": {"identity": [], "financial": [], "purpose_specific": [], "health_biometric": [], "other": []},
            "rejection_reasons": [],
            "processing_time": None,
            "fee": None,
            "application_portal_url": None,
            "sources": [],
        }

    # Normalise structure so the frontend can always render safely
    data.setdefault("found_reliable_source", False)
    data.setdefault("ambiguous", False)
    data.setdefault("consult_professional", not data.get("found_reliable_source", False))
    data.setdefault("warning_message", None)
    data.setdefault("visa_required", True)
    data.setdefault("visa_category", "Unknown")
    data.setdefault("requirements_summary", "")
    checklist = data.get("checklist") or {}
    for cat in ["identity", "financial", "purpose_specific", "health_biometric", "other"]:
        items = checklist.get(cat) or []
        norm = []
        for it in items:
            if isinstance(it, dict):
                norm.append({"item": str(it.get("item", "")), "detail": str(it.get("detail", ""))})
            elif isinstance(it, str):
                norm.append({"item": it, "detail": ""})
        checklist[cat] = norm
    data["checklist"] = checklist
    rr = data.get("rejection_reasons")
    data["rejection_reasons"] = [str(x) for x in rr] if isinstance(rr, list) else []
    for money_key in ("processing_time", "fee"):
        val = data.get(money_key)
        data[money_key] = val if isinstance(val, dict) else None
    portal = data.get("application_portal_url")
    data["application_portal_url"] = portal if isinstance(portal, str) and portal else None
    srcs = data.get("sources")
    data["sources"] = [
        {"url": str(s.get("url", "")), "title": str(s.get("title", "")), "access_date": str(s.get("access_date", ""))}
        for s in srcs if isinstance(s, dict)
    ] if isinstance(srcs, list) else []
    return data

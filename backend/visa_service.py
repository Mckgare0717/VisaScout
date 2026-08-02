import os
import json
import logging
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

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

You MUST use the web_search tool to find CURRENT information from OFFICIAL government and embassy sources
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


async def run_visa_lookup(nationality: str, residence: str, destination: str, purpose: str) -> dict:
    purpose_label = PURPOSE_LABELS.get(purpose, purpose)
    query = (
        f"I hold a passport from {nationality}. I currently reside in {residence}. "
        f"I want to travel to {destination} for the purpose of: {purpose_label}. "
        f"Research the current official visa requirements for this exact pairing and return the JSON object."
    )

    chat = (
        LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"visa-{nationality}-{destination}-{purpose}",
            system_message=build_system_prompt(),
        )
        .with_model("anthropic", "claude-sonnet-5")
        .with_tools(tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}])
        .with_params(max_tokens=8000)
    )

    resp = await chat.send_message_with_tools(UserMessage(text=query))
    content = resp.content or ""
    try:
        data = _extract_json(content)
    except Exception as e:
        logger.error("Failed to parse visa JSON: %s -- raw: %s", e, content[:500])
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
    data.setdefault("rejection_reasons", [])
    data.setdefault("processing_time", None)
    data.setdefault("fee", None)
    data.setdefault("application_portal_url", None)
    data.setdefault("sources", [])
    return data

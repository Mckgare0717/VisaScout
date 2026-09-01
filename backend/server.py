import os
import io
import html
import uuid
import asyncio
import logging
import requests
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (
    hash_password, verify_password, create_access_token,
    make_get_current_user, make_get_current_admin, seed_demo_user,
)
from visa_service import run_visa_lookup, PURPOSE_LABELS
from billing import make_billing_router, public_billing, is_pro, FREE_LOOKUP_LIMIT

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.searches.create_index("user_id")
    await db.user_sessions.create_index("session_token", unique=True)
    await db.feedback.create_index([("rate_key", 1), ("created_at", -1)])
    await db.users.create_index("stripe_customer_id", sparse=True)
    await db.rate_events.create_index([("bucket", 1), ("key", 1), ("at", -1)])
    # TTL cleanup for expired sessions (applies to docs where expires_at is a BSON date).
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.rate_events.create_index("at", expireAfterSeconds=3600)
    # Background lookup tasks do not survive a restart: anything still marked
    # "processing" at boot is dead and would otherwise spin in the UI forever.
    stale = await db.searches.update_many(
        {"status": "processing"},
        {"$set": {"status": "error",
                  "error": "The search was interrupted by a server restart. Please re-run it."}},
    )
    if stale.modified_count:
        logger.info("Marked %d interrupted searches as errored", stale.modified_count)
    await seed_demo_user(db)
    logger.info("VisaScout ready")
    yield
    client.close()


app = FastAPI(title="VisaScout API", lifespan=lifespan)
api = APIRouter(prefix="/api")

get_current_user = make_get_current_user(db)
get_current_admin = make_get_current_admin(db)

OUTDATED_DAYS = 30
EMERGENT_SESSION_URL = os.environ.get(
    "EMERGENT_SESSION_URL",
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
)
SESSION_DAYS = 7
LOOKUP_TIMEOUT_SECONDS = 300
MAX_CONCURRENT_LOOKUPS_PER_USER = 3
NOTIFY_COOLDOWN_HOURS = 24
FEEDBACK_EMAIL = os.environ.get("FEEDBACK_EMAIL", "xanretech@gmail.com")
MAX_FEEDBACK_PER_HOUR = 5
FEEDBACK_CATEGORIES = {
    "bug": "Bug report",
    "accuracy": "Incorrect visa information",
    "idea": "Feature idea",
    "other": "General feedback",
}

# Keep strong references to background lookup tasks: asyncio only holds a weak
# reference to tasks, so an un-referenced task can be garbage-collected mid-run.
_bg_tasks: set = set()


def _spawn_lookup(search_id: str, nationality: str, residence: str, destination: str, purpose: str):
    task = asyncio.create_task(_process_lookup(search_id, nationality, residence, destination, purpose))
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class LookupIn(BaseModel):
    nationality: str = Field(min_length=2)
    residence: str = Field(min_length=2)
    destination: str = Field(min_length=2)
    purpose: str


def public_user(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "name": u.get("name", ""),
        "notify_outdated": u.get("notify_outdated", True),
        "seen_disclaimer": u.get("seen_disclaimer", False),
        "role": u.get("role", "user"),
        "provider": u.get("provider", "email"),
        "picture": u.get("picture"),
        **public_billing(u),
    }


def _client_ip(request: Request) -> str:
    return (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown"))


async def _rate_limit(bucket: str, key: str, limit: int, window_seconds: int):
    # ponytail: count-then-insert, not atomic — a burst can slip 1-2 past the
    # cap. Fine for auth abuse / cost control; swap for a fixed-window counter
    # doc with $inc if precision ever matters.
    now = datetime.now(timezone.utc)
    since = now - timedelta(seconds=window_seconds)
    recent = await db.rate_events.count_documents(
        {"bucket": bucket, "key": key, "at": {"$gte": since}})
    if recent >= limit:
        raise HTTPException(status_code=429,
                            detail="Too many attempts. Please wait a few minutes and try again.")
    await db.rate_events.insert_one({"bucket": bucket, "key": key, "at": now})


def _check_lookup_quota(user: dict):
    if is_pro(user):
        return
    if int(user.get("lookups_used", 0)) >= FREE_LOOKUP_LIMIT:
        raise HTTPException(
            status_code=402,
            detail=(f"You've used your {FREE_LOOKUP_LIMIT} free live lookups. "
                    "Upgrade to Pro for unlimited lookups, re-checks and PDF exports."),
        )


def _days_old(iso: str) -> int:
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).days
    except Exception:
        # An unparseable timestamp must read as stale, not fresh — freshness
        # claims are the product's core promise.
        return OUTDATED_DAYS


def _freshness_date(d: dict) -> str:
    return d.get("checked_at") or d.get("created_at") or ""


# ---------- Auth ----------
@api.post("/auth/register")
async def register(body: RegisterIn, request: Request):
    await _rate_limit("register", _client_ip(request), limit=5, window_seconds=3600)
    email = body.email.lower()
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "user",
        "provider": "email",
        "picture": None,
        "notify_outdated": True,
        "seen_disclaimer": False,
        "plan": "free",
        "lookups_used": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        # The unique index is the authority — a pre-flight find_one would still
        # race with a concurrent registration for the same email.
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    token = create_access_token(user["id"], email)
    return {"token": token, "user": public_user(user)}


class GoogleSessionIn(BaseModel):
    session_id: str


@api.post("/auth/google")
async def google_auth(body: GoogleSessionIn, response: Response):
    # Exchange the one-time Emergent session_id for the user's profile + persistent session token.
    try:
        r = await asyncio.to_thread(
            lambda: requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id}, timeout=15)
        )
    except Exception as e:
        logger.error("emergent session-data call failed: %s", e)
        raise HTTPException(status_code=502, detail="Google sign-in service unavailable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in failed or expired. Please try again.")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account did not return an email")

    user = await db.users.find_one({"email": email})
    if user is None:
        admin_emails = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "password_hash": None,
            "role": "admin" if email in admin_emails else "user",
            "provider": "google",
            "picture": data.get("picture"),
            "notify_outdated": True,
            "seen_disclaimer": True,
            "plan": "free",
            "lookups_used": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(dict(user))
    else:
        upd = {"provider": user.get("provider") or "google"}
        if data.get("picture") and not user.get("picture"):
            upd["picture"] = data["picture"]
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        user.update(upd)

    session_token = data.get("session_token") or str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    # Stored as a BSON date (not ISO string) so the TTL index reaps expired sessions.
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"user_id": user["id"], "session_token": session_token,
                  "expires_at": expires_at,
                  "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", max_age=SESSION_DAYS * 86400, path="/")
    return {"token": session_token, "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    email = body.email.lower()
    await _rate_limit("login", f"{_client_ip(request)}:{email}", limit=8, window_seconds=900)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return {"token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api.post("/auth/seen-disclaimer")
async def seen_disclaimer(user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"seen_disclaimer": True}})
    return {"ok": True}


@api.patch("/auth/preferences")
async def update_prefs(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    notify = bool(body.get("notify_outdated", user.get("notify_outdated", True)))
    await db.users.update_one({"id": user["id"]}, {"$set": {"notify_outdated": notify}})
    return {"notify_outdated": notify}


@api.post("/auth/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Admin ----------
@api.get("/admin/users")
async def admin_users(admin: dict = Depends(get_current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    counts = {}
    async for doc in db.searches.aggregate([{"$group": {"_id": "$user_id", "c": {"$sum": 1}}}]):
        counts[doc["_id"]] = doc["c"]
    for u in users:
        u["search_count"] = counts.get(u["id"], 0)
        u.setdefault("role", "user")
        u.setdefault("provider", "email")
        u.setdefault("picture", None)
        u.setdefault("notify_outdated", True)
    return users


@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_current_admin)):
    total_users = await db.users.count_documents({})
    total_searches = await db.searches.count_documents({})
    google_users = await db.users.count_documents({"provider": "google"})
    admins = await db.users.count_documents({"role": "admin"})
    return {
        "total_users": total_users,
        "total_searches": total_searches,
        "google_users": google_users,
        "email_users": total_users - google_users,
        "admins": admins,
    }


# ---------- Visa ----------
@api.get("/purposes")
async def purposes():
    return [{"value": k, "label": v} for k, v in PURPOSE_LABELS.items()]


async def _process_lookup(search_id: str, nationality: str, residence: str, destination: str, purpose: str):
    """Run the live web search in the background so long requests don't hit the gateway timeout."""
    try:
        result = await asyncio.wait_for(
            run_visa_lookup(nationality, residence, destination, purpose, search_id=search_id),
            timeout=LOOKUP_TIMEOUT_SECONDS,
        )
        await db.searches.update_one(
            {"id": search_id},
            {"$set": {"result": result, "status": "done", "error": None,
                      "checked_at": datetime.now(timezone.utc).isoformat()}},
        )
    except asyncio.TimeoutError:
        logger.error("visa lookup %s timed out after %ss", search_id, LOOKUP_TIMEOUT_SECONDS)
        await db.searches.update_one(
            {"id": search_id},
            {"$set": {"status": "error",
                      "error": "The live source search took too long to complete."}})
    except Exception as e:
        logger.exception("background visa lookup failed")
        await db.searches.update_one(
            {"id": search_id}, {"$set": {"status": "error", "error": str(e)}})


async def _ensure_lookup_capacity(user_id: str):
    # Each lookup fans out into paid LLM + web-search calls; cap in-flight work per user.
    in_flight = await db.searches.count_documents({"user_id": user_id, "status": "processing"})
    if in_flight >= MAX_CONCURRENT_LOOKUPS_PER_USER:
        raise HTTPException(
            status_code=429,
            detail="You already have several searches in progress. Please wait for them to finish.",
        )


@api.post("/visa/lookup")
async def visa_lookup(body: LookupIn, user: dict = Depends(get_current_user)):
    if body.purpose not in PURPOSE_LABELS:
        raise HTTPException(status_code=400, detail="Invalid purpose of travel")
    _check_lookup_quota(user)
    await _ensure_lookup_capacity(user["id"])

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "nationality": body.nationality,
        "residence": body.residence,
        "destination": body.destination,
        "purpose": body.purpose,
        "purpose_label": PURPOSE_LABELS[body.purpose],
        "result": None,
        "status": "processing",
        "error": None,
        "created_at": now,
        "checked_at": now,
    }
    await db.searches.insert_one(dict(doc))
    if not is_pro(user):
        await db.users.update_one({"id": user["id"]}, {"$inc": {"lookups_used": 1}})
    _spawn_lookup(doc["id"], body.nationality, body.residence, body.destination, body.purpose)
    doc.pop("_id", None)
    doc["days_old"] = 0
    doc["outdated"] = False
    return doc


@api.get("/visa/searches")
async def list_searches(user: dict = Depends(get_current_user)):
    docs = await db.searches.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        d.setdefault("status", "done" if d.get("result") else "processing")
        d["days_old"] = _days_old(_freshness_date(d))
        d["outdated"] = d["status"] == "done" and d["days_old"] >= OUTDATED_DAYS
    return docs


@api.get("/visa/searches/{search_id}")
async def get_search(search_id: str, user: dict = Depends(get_current_user)):
    d = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Search not found")
    d.setdefault("status", "done" if d.get("result") else "processing")
    d["days_old"] = _days_old(_freshness_date(d))
    d["outdated"] = d["status"] == "done" and d["days_old"] >= OUTDATED_DAYS
    return d


@api.post("/visa/searches/{search_id}/rerun")
async def rerun_search(search_id: str, user: dict = Depends(get_current_user)):
    old = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Search not found")
    if old.get("status") == "processing":
        raise HTTPException(status_code=409, detail="This search is already being re-checked.")
    if not is_pro(user):
        raise HTTPException(
            status_code=402,
            detail="Re-checking a search against live sources is a Pro feature.")
    await _ensure_lookup_capacity(user["id"])
    await db.searches.update_one({"id": search_id}, {"$set": {"status": "processing", "error": None}})
    _spawn_lookup(search_id, old["nationality"], old["residence"], old["destination"], old["purpose"])
    old["status"] = "processing"
    old["days_old"] = 0
    old["outdated"] = False
    return old


@api.delete("/visa/searches/{search_id}")
async def delete_search(search_id: str, user: dict = Depends(get_current_user)):
    res = await db.searches.delete_one({"id": search_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Search not found")
    return {"ok": True}


# ---------- PDF export ----------
@api.get("/visa/searches/{search_id}/pdf")
async def export_pdf(search_id: str, user: dict = Depends(get_current_user)):
    if not is_pro(user):
        raise HTTPException(status_code=402, detail="PDF checklist export is a Pro feature.")
    d = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Search not found")
    pdf_bytes = _build_pdf(d)
    # Destination is free text; strip anything that could break the header.
    safe_dest = "".join(c if c.isalnum() or c in "-_" else "_" for c in d["destination"].replace(" ", "_").lower())
    filename = f"visascout-{safe_dest or 'visa'}-checklist.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_pdf(d: dict) -> bytes:
    from xml.sax.saxutils import escape as _xml_escape
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    def esc(value) -> str:
        # Paragraph() parses its text as XML-like markup; raw "<" or "&" in
        # user/model-supplied strings would crash or alter the render.
        return _xml_escape(str(value if value is not None else ""))

    r = d.get("result", {})
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    green = HexColor("#1A4331")
    rust = HexColor("#C85A32")
    muted = HexColor("#5A6B62")
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=green, fontSize=22, spaceAfter=4)
    sub = ParagraphStyle("sub", parent=styles["Normal"], textColor=muted, fontSize=9, spaceAfter=10)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=green, fontSize=13, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=15)
    item = ParagraphStyle("item", parent=styles["Normal"], fontSize=10, leading=14, leftIndent=10, spaceAfter=3)
    warn = ParagraphStyle("warn", parent=styles["Normal"], fontSize=10, leading=14, textColor=rust)
    tiny = ParagraphStyle("tiny", parent=styles["Normal"], fontSize=8, textColor=muted, leading=11)

    story = []
    story.append(Paragraph("VisaScout — Document Checklist", h1))
    story.append(Paragraph(
        f"{esc(d.get('nationality',''))} passport &rarr; {esc(d.get('destination',''))} &nbsp;|&nbsp; "
        f"{esc(d.get('purpose_label',''))} &nbsp;|&nbsp; Residence: {esc(d.get('residence',''))}", sub))
    story.append(HRFlowable(width="100%", color=green, thickness=1.2, spaceAfter=8))

    story.append(Paragraph(f"Visa category: {esc(r.get('visa_category','Unknown'))}", h2))
    if r.get("requirements_summary"):
        story.append(Paragraph(esc(r["requirements_summary"]), body))

    if r.get("consult_professional") or r.get("ambiguous") or not r.get("found_reliable_source", True):
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "⚠ " + esc(r.get("warning_message") or "Requirements may be ambiguous. Consult an immigration professional."),
            warn))

    labels = {
        "identity": "Identity", "financial": "Financial", "purpose_specific": "Purpose-specific",
        "health_biometric": "Health / Biometric", "other": "Other",
    }
    checklist = r.get("checklist", {})
    for key, label in labels.items():
        items = checklist.get(key) or []
        if not items:
            continue
        story.append(Paragraph(label, h2))
        for it in items:
            txt = f"&#9744; <b>{esc(it.get('item',''))}</b>"
            if it.get("detail"):
                txt += f" — {esc(it['detail'])}"
            story.append(Paragraph(txt, item))

    if r.get("rejection_reasons"):
        story.append(Paragraph("Common rejection reasons", h2))
        for rr in r["rejection_reasons"]:
            story.append(Paragraph(f"&bull; {esc(rr)}", item))

    pt, fee = r.get("processing_time"), r.get("fee")
    if pt or fee:
        story.append(Paragraph("Processing & Fees", h2))
        if pt:
            story.append(Paragraph(f"Processing time: <b>{esc(pt.get('value',''))}</b> (checked {esc(pt.get('date_checked',''))})", body))
        if fee:
            story.append(Paragraph(f"Fee: <b>{esc(fee.get('value',''))}</b> (checked {esc(fee.get('date_checked',''))})", body))

    sources = r.get("sources") or []
    if sources:
        story.append(Paragraph("Sources", h2))
        for s in sources:
            story.append(Paragraph(
                f"&bull; {esc(s.get('title','') or s.get('url',''))} — {esc(s.get('url',''))} "
                f"(accessed {esc(s.get('access_date',''))})", tiny))

    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", color=muted, thickness=0.5, spaceAfter=6))
    story.append(Paragraph(
        "This document is informational only and not legal advice. Visa rules change frequently — always verify "
        "with official government sources before applying. Generated by VisaScout on "
        + datetime.now(timezone.utc).strftime("%Y-%m-%d"), tiny))

    doc.build(story)
    return buf.getvalue()


# ---------- Email notification (Resend) ----------
@api.post("/visa/searches/{search_id}/notify")
async def notify_outdated(search_id: str, user: dict = Depends(get_current_user)):
    if not is_pro(user):
        raise HTTPException(status_code=402, detail="Outdated-search email alerts are a Pro feature.")
    d = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Search not found")
    if not user.get("notify_outdated", True):
        raise HTTPException(status_code=400, detail="Email alerts are disabled in your settings.")
    last = d.get("last_notified_at")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_dt < timedelta(hours=NOTIFY_COOLDOWN_HOURS):
                raise HTTPException(status_code=429,
                                    detail="An email for this search was already sent in the last 24 hours.")
        except ValueError:
            pass
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Email notifications are not configured yet (missing RESEND_API_KEY).")

    import resend
    resend.api_key = api_key
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    days = _days_old(_freshness_date(d))
    name = html.escape(user.get("name") or "there")
    nationality = html.escape(d.get("nationality", ""))
    destination = html.escape(d.get("destination", ""))
    purpose_label = html.escape(d.get("purpose_label", ""))
    email_html = f"""
    <div style="font-family:Arial,sans-serif;color:#171A1C">
      <h2 style="color:#1A4331">VisaScout — Your saved search may be outdated</h2>
      <p>Hi {name},</p>
      <p>Your saved visa search for <b>{nationality} &rarr; {destination}</b>
      ({purpose_label}) was last checked <b>{days} days ago</b>.</p>
      <p>Visa rules change frequently. We recommend re-running this search to confirm the latest
      official requirements, fees and processing times.</p>
      <p style="color:#5A6B62;font-size:12px">This is an informational notice, not legal advice.</p>
    </div>"""
    params = {
        "from": sender,
        "to": [user["email"]],
        "subject": f"Visa info for {d.get('destination', 'your destination')} may be outdated",
        "html": email_html,
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error("resend failed: %s", e)
        raise HTTPException(status_code=400, detail=f"Failed to send email: {str(e)}")
    await db.searches.update_one(
        {"id": search_id},
        {"$set": {"last_notified_at": datetime.now(timezone.utc).isoformat()}})
    return {"status": "sent", "email_id": email.get("id") if isinstance(email, dict) else None}


# ---------- Feedback ----------
class FeedbackIn(BaseModel):
    category: str = Field(default="other")
    message: str = Field(min_length=5, max_length=4000)
    email: EmailStr | None = None
    page: str | None = Field(default=None, max_length=300)


@api.post("/feedback")
async def submit_feedback(body: FeedbackIn, request: Request):
    if body.category not in FEEDBACK_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid feedback category")

    # Feedback is open to signed-out visitors too, so identify by user when a
    # valid token is present and fall back to IP for rate limiting.
    user = None
    try:
        user = await get_current_user(request)
    except HTTPException:
        pass
    client_ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                 or (request.client.host if request.client else "unknown"))
    rate_key = f"user:{user['id']}" if user else f"ip:{client_ip}"

    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.feedback.count_documents({"rate_key": rate_key, "created_at": {"$gte": since}})
    if recent >= MAX_FEEDBACK_PER_HOUR:
        raise HTTPException(status_code=429, detail="Thanks — you've sent several messages already. Please try again later.")

    reply_to = body.email or (user["email"] if user else None)
    doc = {
        "id": str(uuid.uuid4()),
        "category": body.category,
        "message": body.message,
        "reply_to": reply_to,
        "page": body.page,
        "user_id": user["id"] if user else None,
        "user_name": user.get("name") if user else None,
        "rate_key": rate_key,
        "user_agent": request.headers.get("user-agent", "")[:300],
        "emailed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Persist first: a mail outage must never lose the feedback itself.
    await db.feedback.insert_one(dict(doc))

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if api_key:
        import resend
        resend.api_key = api_key
        sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
        label = FEEDBACK_CATEGORIES[body.category]
        rows = [
            ("Category", label),
            ("From", f"{doc['user_name']} <{reply_to}>" if doc["user_name"] else (reply_to or "anonymous")),
            ("Account", "signed in" if user else "signed out"),
            ("Page", body.page or "—"),
            ("Received", doc["created_at"]),
        ]
        rows_html = "".join(
            f'<tr><td style="padding:4px 12px 4px 0;color:#5A6B62;font-size:13px">{html.escape(k)}</td>'
            f'<td style="padding:4px 0;font-size:13px">{html.escape(str(v))}</td></tr>'
            for k, v in rows
        )
        email_html = f"""
        <div style="font-family:Arial,sans-serif;color:#171A1C">
          <h2 style="color:#1A4331;margin-bottom:4px">VisaScout — new {html.escape(label.lower())}</h2>
          <table style="border-collapse:collapse;margin-bottom:16px">{rows_html}</table>
          <div style="border-left:4px solid #1A4331;padding:12px 16px;background:#F9F8F6;white-space:pre-wrap">{html.escape(body.message)}</div>
        </div>"""
        params = {
            "from": sender,
            "to": [FEEDBACK_EMAIL],
            "subject": f"[VisaScout] {label}",
            "html": email_html,
        }
        if reply_to:
            params["reply_to"] = reply_to
        try:
            await asyncio.to_thread(resend.Emails.send, params)
            await db.feedback.update_one({"id": doc["id"]}, {"$set": {"emailed": True}})
        except Exception as e:
            # Already stored — surface in logs and still thank the user.
            logger.error("feedback email failed for %s: %s", doc["id"], e)
    else:
        logger.warning("feedback %s stored but not emailed (RESEND_API_KEY unset)", doc["id"])

    return {"ok": True}


@api.get("/admin/feedback")
async def admin_feedback(admin: dict = Depends(get_current_admin)):
    return await db.feedback.find({}, {"_id": 0, "rate_key": 0}).sort("created_at", -1).to_list(500)


@api.get("/")
async def root():
    return {"service": "VisaScout API", "status": "ok"}


api.include_router(make_billing_router(db, get_current_user))
app.include_router(api)

# Browsers reject "Access-Control-Allow-Origin: *" on credentialed requests, so a
# wildcard origin list only works without credentials. Pin CORS_ORIGINS to the real
# frontend origin(s) in production to enable the cookie-based session flow.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if not _cors_origins or _cors_origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

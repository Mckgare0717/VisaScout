import os
import io
import uuid
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (
    hash_password, verify_password, create_access_token,
    make_get_current_user, seed_demo_user,
)
from visa_service import run_visa_lookup, PURPOSE_LABELS

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="VisaScout API")
api = APIRouter(prefix="/api")

get_current_user = make_get_current_user(db)

OUTDATED_DAYS = 30


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
    }


def _days_old(iso: str) -> int:
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).days
    except Exception:
        return 0


# ---------- Auth ----------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "notify_outdated": True,
        "seen_disclaimer": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], email)
    return {"token": token, "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
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


# ---------- Visa ----------
@api.get("/purposes")
async def purposes():
    return [{"value": k, "label": v} for k, v in PURPOSE_LABELS.items()]


async def _process_lookup(search_id: str, nationality: str, residence: str, destination: str, purpose: str):
    """Run the live web search in the background so long requests don't hit the gateway timeout."""
    try:
        result = await run_visa_lookup(nationality, residence, destination, purpose)
        await db.searches.update_one(
            {"id": search_id},
            {"$set": {"result": result, "status": "done", "error": None,
                      "created_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception as e:
        logger.exception("background visa lookup failed")
        await db.searches.update_one(
            {"id": search_id}, {"$set": {"status": "error", "error": str(e)}})


@api.post("/visa/lookup")
async def visa_lookup(body: LookupIn, user: dict = Depends(get_current_user)):
    if body.purpose not in PURPOSE_LABELS:
        raise HTTPException(status_code=400, detail="Invalid purpose of travel")

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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.searches.insert_one(dict(doc))
    asyncio.create_task(_process_lookup(doc["id"], body.nationality, body.residence, body.destination, body.purpose))
    doc.pop("_id", None)
    doc["days_old"] = 0
    doc["outdated"] = False
    return doc


@api.get("/visa/searches")
async def list_searches(user: dict = Depends(get_current_user)):
    docs = await db.searches.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        d.setdefault("status", "done" if d.get("result") else "processing")
        d["days_old"] = _days_old(d["created_at"])
        d["outdated"] = d["status"] == "done" and d["days_old"] >= OUTDATED_DAYS
    return docs


@api.get("/visa/searches/{search_id}")
async def get_search(search_id: str, user: dict = Depends(get_current_user)):
    d = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Search not found")
    d.setdefault("status", "done" if d.get("result") else "processing")
    d["days_old"] = _days_old(d["created_at"])
    d["outdated"] = d["status"] == "done" and d["days_old"] >= OUTDATED_DAYS
    return d


@api.post("/visa/searches/{search_id}/rerun")
async def rerun_search(search_id: str, user: dict = Depends(get_current_user)):
    old = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Search not found")
    await db.searches.update_one({"id": search_id}, {"$set": {"status": "processing", "error": None}})
    asyncio.create_task(_process_lookup(search_id, old["nationality"], old["residence"], old["destination"], old["purpose"]))
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
    d = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Search not found")
    pdf_bytes = _build_pdf(d)
    filename = f"visascout-{d['destination'].replace(' ', '_').lower()}-checklist.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_pdf(d: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

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
        f"{d.get('nationality','')} passport &rarr; {d.get('destination','')} &nbsp;|&nbsp; "
        f"{d.get('purpose_label','')} &nbsp;|&nbsp; Residence: {d.get('residence','')}", sub))
    story.append(HRFlowable(width="100%", color=green, thickness=1.2, spaceAfter=8))

    story.append(Paragraph(f"Visa category: {r.get('visa_category','Unknown')}", h2))
    if r.get("requirements_summary"):
        story.append(Paragraph(r["requirements_summary"], body))

    if r.get("consult_professional") or r.get("ambiguous") or not r.get("found_reliable_source", True):
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "⚠ " + (r.get("warning_message") or "Requirements may be ambiguous. Consult an immigration professional."),
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
            txt = f"&#9744; <b>{it.get('item','')}</b>"
            if it.get("detail"):
                txt += f" — {it['detail']}"
            story.append(Paragraph(txt, item))

    if r.get("rejection_reasons"):
        story.append(Paragraph("Common rejection reasons", h2))
        for rr in r["rejection_reasons"]:
            story.append(Paragraph(f"&bull; {rr}", item))

    pt, fee = r.get("processing_time"), r.get("fee")
    if pt or fee:
        story.append(Paragraph("Processing & Fees", h2))
        if pt:
            story.append(Paragraph(f"Processing time: <b>{pt.get('value','')}</b> (checked {pt.get('date_checked','')})", body))
        if fee:
            story.append(Paragraph(f"Fee: <b>{fee.get('value','')}</b> (checked {fee.get('date_checked','')})", body))

    sources = r.get("sources") or []
    if sources:
        story.append(Paragraph("Sources", h2))
        for s in sources:
            story.append(Paragraph(f"&bull; {s.get('title','') or s.get('url','')} — {s.get('url','')} (accessed {s.get('access_date','')})", tiny))

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
    d = await db.searches.find_one({"id": search_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Search not found")
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Email notifications are not configured yet (missing RESEND_API_KEY).")

    import resend
    resend.api_key = api_key
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    days = _days_old(d["created_at"])
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#171A1C">
      <h2 style="color:#1A4331">VisaScout — Your saved search may be outdated</h2>
      <p>Hi {user.get('name','there')},</p>
      <p>Your saved visa search for <b>{d['nationality']} &rarr; {d['destination']}</b>
      ({d.get('purpose_label','')}) was last checked <b>{days} days ago</b>.</p>
      <p>Visa rules change frequently. We recommend re-running this search to confirm the latest
      official requirements, fees and processing times.</p>
      <p style="color:#5A6B62;font-size:12px">This is an informational notice, not legal advice.</p>
    </div>"""
    params = {
        "from": sender,
        "to": [user["email"]],
        "subject": f"Visa info for {d['destination']} may be outdated",
        "html": html,
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error("resend failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to send email: {str(e)}")
    return {"status": "sent", "email_id": email.get("id") if isinstance(email, dict) else None}


@api.get("/")
async def root():
    return {"service": "VisaScout API", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.searches.create_index("user_id")
    await seed_demo_user(db)
    logger.info("VisaScout ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()

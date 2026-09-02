"""Schengen visa application — fill the harmonised form online, pay a one-off
fee, download / get emailed a filled PDF.

The blank EU form is free; the fee covers the guided fill + PDF generation. We
reproduce the current harmonised form (Regulation (EU) 2019/1155 — 32 numbered
fields) as a clean PDF: there is no single official fillable PDF to overlay, and
every consulate publishes its own copy of the same form.

Not legal advice. The applicant still signs, attaches a photo, and lodges the
form at the relevant consulate / visa centre.
"""
import io
import os
import uuid
import base64
import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from billing import stripe_client, billing_configured

logger = logging.getLogger(__name__)

FORM_PRICE_PENCE = int(os.environ.get("SCHENGEN_FORM_PRICE_PENCE", "300"))
FORM_CURRENCY = os.environ.get("SCHENGEN_FORM_CURRENCY", "gbp")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")

_CURRENCY_SYMBOL = {"gbp": "£", "eur": "€", "usd": "$"}


def price_label() -> str:
    sym = _CURRENCY_SYMBOL.get(FORM_CURRENCY.lower(), FORM_CURRENCY.upper() + " ")
    amount = FORM_PRICE_PENCE / 100
    return f"{sym}{int(amount)}" if amount == int(amount) else f"{sym}{amount:.2f}"


SCHENGEN_STATES = [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Czechia", "Denmark", "Estonia",
    "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Italy",
    "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Netherlands",
    "Norway", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain",
    "Sweden", "Switzerland",
]

# One source of truth: drives the frontend form, the key whitelist, and the PDF.
# type: text | textarea | date | select | radio | checks (checks value is a list)
FORM_SCHEMA = [
    {"title": "Applicant", "fields": [
        {"key": "f1", "label": "1. Surname (family name)", "type": "text"},
        {"key": "f2", "label": "2. Surname at birth (former family name(s))", "type": "text"},
        {"key": "f3", "label": "3. First name(s) (given name(s))", "type": "text"},
        {"key": "f4", "label": "4. Date of birth", "type": "date"},
        {"key": "f5", "label": "5. Place of birth", "type": "text"},
        {"key": "f6", "label": "6. Country of birth", "type": "text"},
        {"key": "f7a", "label": "7. Current nationality", "type": "text"},
        {"key": "f7b", "label": "7. Nationality at birth, if different", "type": "text"},
        {"key": "f7c", "label": "7. Other nationalities", "type": "text"},
        {"key": "f8", "label": "8. Sex", "type": "radio", "options": ["Male", "Female"]},
        {"key": "f9", "label": "9. Civil status", "type": "select",
         "options": ["Single", "Married", "Registered partnership", "Separated",
                     "Divorced", "Widow(er)", "Other"]},
        {"key": "f9_other", "label": "9. If other civil status, specify", "type": "text"},
        {"key": "f10", "label": "10. Parental authority (for minors) / legal guardian — "
                                "surname, first name, address, telephone, email, nationality", "type": "textarea"},
        {"key": "f11", "label": "11. National identity number, where applicable", "type": "text"},
    ]},
    {"title": "Travel document", "fields": [
        {"key": "f12", "label": "12. Type of travel document", "type": "select",
         "options": ["Ordinary passport", "Diplomatic passport", "Service passport",
                     "Official passport", "Special passport", "Other"]},
        {"key": "f12_other", "label": "12. If other travel document, specify", "type": "text"},
        {"key": "f13", "label": "13. Number of travel document", "type": "text"},
        {"key": "f14", "label": "14. Date of issue", "type": "date"},
        {"key": "f15", "label": "15. Valid until", "type": "date"},
        {"key": "f16", "label": "16. Issued by (country)", "type": "text"},
    ]},
    {"title": "Family member who is an EU, EEA or CH citizen (if applicable)", "fields": [
        {"key": "f17_surname", "label": "17. Surname (family name)", "type": "text"},
        {"key": "f17_firstname", "label": "17. First name(s) (given name(s))", "type": "text"},
        {"key": "f17_dob", "label": "17. Date of birth", "type": "date"},
        {"key": "f17_nationality", "label": "17. Nationality", "type": "text"},
        {"key": "f17_docno", "label": "17. Number of travel document or ID card", "type": "text"},
        {"key": "f18", "label": "18. Family relationship with the EU, EEA or CH citizen", "type": "select",
         "options": ["Spouse", "Child", "Grandchild", "Dependent ascendant",
                     "Registered partnership", "Other"]},
        {"key": "f18_other", "label": "18. If other relationship, specify", "type": "text"},
    ]},
    {"title": "Residence & occupation", "fields": [
        {"key": "f19_address", "label": "19. Applicant's home address and email address", "type": "textarea"},
        {"key": "f19_phone", "label": "19. Telephone no.", "type": "text"},
        {"key": "f20", "label": "20. Residence in a country other than the country of current nationality",
         "type": "radio", "options": ["No", "Yes"]},
        {"key": "f20_permit_no", "label": "20. If yes — residence permit or equivalent no.", "type": "text"},
        {"key": "f20_valid_until", "label": "20. If yes — valid until", "type": "date"},
        {"key": "f21", "label": "21. Current occupation", "type": "text"},
        {"key": "f22", "label": "22. Employer — name, address and telephone number "
                                "(students: name and address of educational establishment)", "type": "textarea"},
    ]},
    {"title": "Journey", "fields": [
        {"key": "f23", "label": "23. Purpose(s) of the journey", "type": "checks",
         "options": ["Tourism", "Business", "Visiting family or friends", "Cultural", "Sports",
                     "Official visit", "Medical reasons", "Study", "Airport transit", "Other"]},
        {"key": "f23_other", "label": "23. If other purpose, specify", "type": "text"},
        {"key": "f24", "label": "24. Additional information on purpose of stay", "type": "textarea"},
        {"key": "f25", "label": "25. Member State of main destination (and other Member States of destination, if applicable)", "type": "text"},
        {"key": "f26", "label": "26. Member State of first entry", "type": "text"},
        {"key": "f27", "label": "27. Number of entries requested", "type": "radio",
         "options": ["Single entry", "Two entries", "Multiple entries"]},
        {"key": "f27_arrival", "label": "27. Intended date of arrival of the first intended stay in the Schengen area", "type": "date"},
        {"key": "f27_departure", "label": "27. Intended date of departure from the Schengen area after the first intended stay", "type": "date"},
        {"key": "f28", "label": "28. Fingerprints collected previously for the purpose of applying for a Schengen visa",
         "type": "radio", "options": ["No", "Yes"]},
        {"key": "f28_date", "label": "28. If yes — date, if known", "type": "date"},
        {"key": "f28_sticker", "label": "28. If yes — visa sticker number, if known", "type": "text"},
        {"key": "f29_issued_by", "label": "29. Entry permit for the final country of destination (if applicable) — issued by", "type": "text"},
        {"key": "f29_valid_from", "label": "29. Entry permit — valid from", "type": "date"},
        {"key": "f29_valid_until", "label": "29. Entry permit — valid until", "type": "date"},
    ]},
    {"title": "Host / accommodation", "fields": [
        {"key": "f30_name", "label": "30. Inviting person(s) in the Member State(s), or name of hotel(s) / temporary accommodation(s)", "type": "textarea"},
        {"key": "f30_address", "label": "30. Address and email of inviting person(s) / hotel(s) / accommodation(s)", "type": "textarea"},
        {"key": "f30_phone", "label": "30. Telephone no.", "type": "text"},
        {"key": "f31_company", "label": "31. Name and address of inviting company / organisation", "type": "textarea"},
        {"key": "f31_company_phone", "label": "31. Telephone no. of company / organisation", "type": "text"},
        {"key": "f31_contact", "label": "31. Contact person in the company / organisation — surname, first name, address, telephone, email", "type": "textarea"},
    ]},
    {"title": "Cost of travelling and living", "fields": [
        {"key": "f32_who", "label": "32. Costs during the applicant's stay are covered by", "type": "radio",
         "options": ["The applicant", "A sponsor (host, company, organisation)"]},
        {"key": "f32_applicant_means", "label": "32. If by the applicant — means of support", "type": "checks",
         "options": ["Cash", "Traveller's cheques", "Credit card", "Pre-paid accommodation",
                     "Pre-paid transport", "Other"]},
        {"key": "f32_applicant_other", "label": "32. Applicant means — if other, specify", "type": "text"},
        {"key": "f32_sponsor", "label": "32. If by a sponsor", "type": "select",
         "options": ["Referred to in field 30 or 31", "Other"]},
        {"key": "f32_sponsor_other", "label": "32. Sponsor — if other, specify", "type": "text"},
        {"key": "f32_sponsor_means", "label": "32. Sponsor — means of support", "type": "checks",
         "options": ["Cash", "Accommodation provided", "All expenses covered during the stay",
                     "Pre-paid transport", "Other"]},
        {"key": "f32_sponsor_means_other", "label": "32. Sponsor means — if other, specify", "type": "text"},
    ]},
    {"title": "Declaration", "fields": [
        {"key": "decl_place_date", "label": "Place and date", "type": "text"},
    ]},
]

ALLOWED_KEYS = {f["key"] for section in FORM_SCHEMA for f in section["fields"]}
_FIELD_BY_KEY = {f["key"]: f for section in FORM_SCHEMA for f in section["fields"]}

MAX_VALUE_LEN = 2000
MAX_LIST_ITEMS = 20


def clean_form_data(data: dict) -> dict:
    """Whitelist keys, coerce to str / list[str], cap lengths. The consulate
    validates the actual content — we only guard size and shape."""
    out: dict = {}
    for key, value in (data or {}).items():
        if key not in ALLOWED_KEYS:
            continue
        if isinstance(value, list):
            out[key] = [str(x)[:200] for x in value[:MAX_LIST_ITEMS] if str(x).strip()]
        else:
            text = str(value)[:MAX_VALUE_LEN]
            if text.strip():
                out[key] = text
    return out


def _fmt(value) -> str:
    if value is None or value == "" or value == []:
        return "—"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value) or "—"
    return str(value)


def build_schengen_pdf(form: dict) -> bytes:
    from xml.sax.saxutils import escape as xml_escape
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    def esc(v) -> str:
        return xml_escape(str(v if v is not None else ""))

    data = form.get("data", {}) or {}
    country = form.get("country") or ""

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm,
                            title="Application for Schengen Visa")
    styles = getSampleStyleSheet()
    green = HexColor("#1A4331")
    muted = HexColor("#5A6B62")
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=green, fontSize=18, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=styles["Normal"], textColor=muted, fontSize=9, spaceAfter=8)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=green, fontSize=12,
                        spaceBefore=12, spaceAfter=4)
    row = ParagraphStyle("row", parent=styles["Normal"], fontSize=9.5, leading=13, spaceAfter=3)
    tiny = ParagraphStyle("tiny", parent=styles["Normal"], fontSize=8, textColor=muted, leading=11)

    story = [
        Paragraph("Application for Schengen Visa", h1),
        Paragraph(
            f"Harmonised application form (Regulation (EU) 2019/1155)"
            + (f" &nbsp;|&nbsp; Consulate: {esc(country)}" if country else ""), sub),
        HRFlowable(width="100%", color=green, thickness=1, spaceAfter=6),
    ]
    for section in FORM_SCHEMA:
        story.append(Paragraph(esc(section["title"]), h2))
        for field in section["fields"]:
            val = _fmt(data.get(field["key"]))
            story.append(Paragraph(f"<b>{esc(field['label'])}</b><br/>{esc(val)}", row))

    story.append(Spacer(1, 16))
    story.append(Paragraph("Signature: ______________________________", row))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", color=muted, thickness=0.5, spaceAfter=6))
    story.append(Paragraph(
        "Generated by VisaScout on "
        + datetime.now(timezone.utc).strftime("%Y-%m-%d")
        + ". This is a filled copy of the free EU harmonised form for your review — "
        "not legal advice. Sign it, attach a passport photo, and lodge it at the relevant "
        "consulate or visa centre. Verify current requirements with that authority.", tiny))

    doc.build(story)
    return buf.getvalue()


# ---------- Models ----------
class FormCreateIn(BaseModel):
    country: str | None = Field(default=None, max_length=60)


class FormUpdateIn(BaseModel):
    country: str | None = Field(default=None, max_length=60)
    data: dict | None = None


def _public_form(f: dict) -> dict:
    return {
        "id": f["id"],
        "kind": f.get("kind", "schengen"),
        "country": f.get("country"),
        "data": f.get("data", {}),
        "paid": bool(f.get("paid")),
        "created_at": f.get("created_at"),
        "updated_at": f.get("updated_at"),
    }


def make_forms_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/forms")

    async def _owned(form_id: str, user: dict) -> dict:
        f = await db.visa_forms.find_one({"id": form_id, "user_id": user["id"]}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Form not found")
        return f

    @router.get("/schengen/schema")
    async def schema():
        return {
            "sections": FORM_SCHEMA,
            "countries": SCHENGEN_STATES,
            "price_label": price_label(),
            "price_pence": FORM_PRICE_PENCE,
            "currency": FORM_CURRENCY,
            "billing_enabled": billing_configured(),
        }

    @router.get("")
    async def list_forms(user: dict = Depends(get_current_user)):
        docs = await db.visa_forms.find(
            {"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        return [_public_form(d) for d in docs]

    @router.post("")
    async def create_form(body: FormCreateIn, user: dict = Depends(get_current_user)):
        country = body.country if body.country in SCHENGEN_STATES else None
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "kind": "schengen",
            "country": country,
            "data": {},
            "paid": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.visa_forms.insert_one(dict(doc))
        return _public_form(doc)

    @router.get("/{form_id}")
    async def get_form(form_id: str, user: dict = Depends(get_current_user)):
        return _public_form(await _owned(form_id, user))

    @router.put("/{form_id}")
    async def update_form(form_id: str, body: FormUpdateIn, user: dict = Depends(get_current_user)):
        f = await _owned(form_id, user)
        updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if body.country is not None:
            updates["country"] = body.country if body.country in SCHENGEN_STATES else None
        if body.data is not None:
            updates["data"] = clean_form_data(body.data)
        await db.visa_forms.update_one({"id": form_id}, {"$set": updates})
        f.update(updates)
        return _public_form(f)

    @router.delete("/{form_id}")
    async def delete_form(form_id: str, user: dict = Depends(get_current_user)):
        res = await db.visa_forms.delete_one({"id": form_id, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Form not found")
        return {"ok": True}

    @router.post("/{form_id}/checkout")
    async def checkout(form_id: str, user: dict = Depends(get_current_user)):
        f = await _owned(form_id, user)
        if f.get("paid"):
            raise HTTPException(status_code=400, detail="This form is already paid for.")
        if not billing_configured():
            raise HTTPException(status_code=503, detail="Payments are not configured yet.")
        if not APP_URL:
            raise HTTPException(status_code=503, detail="Billing return URL is not configured.")
        meta = {"kind": "schengen_form", "form_id": form_id, "user_id": user["id"]}
        client = stripe_client()
        try:
            session = client.v1.checkout.sessions.create(params={
                "mode": "payment",
                "line_items": [{
                    "price_data": {
                        "currency": FORM_CURRENCY,
                        "product_data": {"name": "Schengen visa application form (filled PDF)"},
                        "unit_amount": FORM_PRICE_PENCE,
                    },
                    "quantity": 1,
                }],
                "client_reference_id": user["id"],
                "customer_email": user.get("email"),
                "metadata": meta,
                # Mirror onto the PaymentIntent so a payment_intent.succeeded
                # handler could also see it if we add one later.
                "payment_intent_data": {"metadata": meta},
                "success_url": f"{APP_URL}/app/forms/{form_id}?paid=1",
                "cancel_url": f"{APP_URL}/app/forms/{form_id}?checkout=cancelled",
            })
        except Exception as e:  # stripe raises several error types; treat all as upstream
            logger.error("schengen form checkout failed for %s: %s", form_id, e)
            raise HTTPException(status_code=502, detail="Could not start checkout. Please try again.")
        return {"url": session.url}

    @router.get("/{form_id}/pdf")
    async def form_pdf(form_id: str, user: dict = Depends(get_current_user)):
        f = await _owned(form_id, user)
        if not f.get("paid"):
            raise HTTPException(status_code=402, detail="Pay for this form to download the PDF.")
        pdf = build_schengen_pdf(f)
        safe = "".join(c if c.isalnum() or c in "-_" else "_"
                       for c in (f.get("country") or "schengen").replace(" ", "_").lower())
        return StreamingResponse(
            io.BytesIO(pdf), media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="schengen-visa-{safe}.pdf"'})

    @router.post("/{form_id}/email")
    async def email_form(form_id: str, user: dict = Depends(get_current_user)):
        f = await _owned(form_id, user)
        if not f.get("paid"):
            raise HTTPException(status_code=402, detail="Pay for this form to email the PDF.")
        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503,
                                detail="Email delivery is not configured yet. Use Download instead.")
        import resend
        resend.api_key = api_key
        sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
        pdf_b64 = base64.b64encode(build_schengen_pdf(f)).decode("ascii")
        params = {
            "from": sender,
            "to": [user["email"]],
            "subject": "Your Schengen visa application form",
            "html": ("<div style=\"font-family:Arial,sans-serif;color:#171A1C\">"
                     "<h2 style=\"color:#1A4331\">Your Schengen visa application form</h2>"
                     "<p>Your filled application form is attached as a PDF. Print it, sign it, "
                     "attach a passport photo and lodge it at the relevant consulate or visa "
                     "centre.</p>"
                     "<p style=\"color:#5A6B62;font-size:12px\">Informational only, not legal advice. "
                     "Always verify current requirements with the official authority.</p></div>"),
            "attachments": [{"filename": "schengen-visa-application.pdf", "content": pdf_b64}],
        }
        try:
            sent = await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logger.error("schengen form email failed for %s: %s", form_id, e)
            raise HTTPException(status_code=502, detail="Could not send the email. Please try again later.")
        return {"status": "sent", "email_id": sent.get("id") if isinstance(sent, dict) else None}

    return router

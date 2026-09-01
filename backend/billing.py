"""Stripe billing: freemium -> Pro subscription.

Free users get FREE_LOOKUP_LIMIT live lookups. Pro (a single monthly price)
unlocks unlimited lookups + re-checks. Plan state is driven entirely by Stripe
webhooks so a failed renewal or a cancellation downgrades the user automatically.
"""
import os
import logging

import stripe as stripe_sdk
from fastapi import APIRouter, Depends, Request, HTTPException

logger = logging.getLogger(__name__)

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "").strip()
# Frontend origin Checkout / Portal return to, e.g. https://visascout.app
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
FREE_LOOKUP_LIMIT = int(os.environ.get("FREE_LOOKUP_LIMIT", "2"))
PRO_PRICE_LABEL = os.environ.get("PRO_PRICE_LABEL", "£7/mo")

_ACTIVE_STATUSES = {"active", "trialing", "past_due"}
_client = None


def billing_configured() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID)


def _stripe() -> stripe_sdk.StripeClient:
    global _client
    if _client is None:
        if not billing_configured():
            raise HTTPException(status_code=503, detail="Billing is not configured yet.")
        _client = stripe_sdk.StripeClient(STRIPE_SECRET_KEY)
    return _client


def public_billing(user: dict) -> dict:
    plan = user.get("plan", "free")
    used = int(user.get("lookups_used", 0))
    return {
        "plan": plan,
        "lookups_used": used,
        "free_lookup_limit": FREE_LOOKUP_LIMIT,
        "lookups_remaining": None if plan == "pro" else max(0, FREE_LOOKUP_LIMIT - used),
        "billing_enabled": billing_configured(),
        "pro_price_label": PRO_PRICE_LABEL,
    }


def is_pro(user: dict) -> bool:
    return user.get("plan") == "pro" or user.get("role") == "admin"


def make_billing_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/billing")

    async def _apply_subscription(customer_id: str, status: str, subscription_id: str | None):
        plan = "pro" if status in _ACTIVE_STATUSES else "free"
        res = await db.users.update_one(
            {"stripe_customer_id": customer_id},
            {"$set": {"plan": plan, "stripe_subscription_id": subscription_id,
                      "stripe_subscription_status": status}},
        )
        if res.matched_count == 0:
            logger.warning("stripe webhook: no user for customer %s", customer_id)

    @router.get("/status")
    async def status(user: dict = Depends(get_current_user)):
        return public_billing(user)

    @router.post("/checkout")
    async def create_checkout(user: dict = Depends(get_current_user)):
        if is_pro(user):
            raise HTTPException(status_code=400, detail="You're already on Pro.")
        if not APP_URL:
            raise HTTPException(status_code=503, detail="Billing return URL is not configured.")
        client = _stripe()
        params = {
            "mode": "subscription",
            "line_items": [{"price": STRIPE_PRICE_ID, "quantity": 1}],
            "client_reference_id": user["id"],
            "allow_promotion_codes": True,
            "success_url": f"{APP_URL}/app?upgraded=1",
            "cancel_url": f"{APP_URL}/app/settings?checkout=cancelled",
            # Tag for Dashboard funnel comparison (skill guidance).
            "integration_identifier": "visascout_pro_kxqrmytd",
        }
        if user.get("stripe_customer_id"):
            params["customer"] = user["stripe_customer_id"]
        else:
            params["customer_email"] = user["email"]
        try:
            session = client.v1.checkout.sessions.create(params=params)
        except stripe_sdk.StripeError as e:
            logger.error("stripe checkout create failed: %s", e)
            raise HTTPException(status_code=502, detail="Could not start checkout. Please try again.")
        return {"url": session.url}

    @router.post("/portal")
    async def create_portal(user: dict = Depends(get_current_user)):
        customer_id = user.get("stripe_customer_id")
        if not customer_id:
            raise HTTPException(status_code=400, detail="No billing account yet — upgrade first.")
        if not APP_URL:
            raise HTTPException(status_code=503, detail="Billing return URL is not configured.")
        client = _stripe()
        try:
            portal = client.v1.billing_portal.sessions.create(
                params={"customer": customer_id, "return_url": f"{APP_URL}/app/settings"}
            )
        except stripe_sdk.StripeError as e:
            logger.error("stripe portal create failed: %s", e)
            raise HTTPException(status_code=502, detail="Could not open the billing portal.")
        return {"url": portal.url}

    @router.post("/webhook")
    async def webhook(request: Request):
        if not STRIPE_WEBHOOK_SECRET:
            raise HTTPException(status_code=503, detail="Webhook secret not configured.")
        payload = await request.body()
        sig = request.headers.get("stripe-signature", "")
        try:
            event = stripe_sdk.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe_sdk.SignatureVerificationError):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

        obj = event["data"]["object"]
        etype = event["type"]

        if etype == "checkout.session.completed":
            user_id = obj.get("client_reference_id")
            customer_id = obj.get("customer")
            # A session can complete with payment still pending (async payment
            # methods) — only grant Pro once Stripe confirms it is actually paid.
            paid = obj.get("payment_status") in ("paid", "no_payment_required")
            if user_id and customer_id:
                fields = {"stripe_customer_id": customer_id}
                if paid:
                    fields["plan"] = "pro"
                await db.users.update_one({"id": user_id}, {"$set": fields})
        elif etype in ("customer.subscription.updated", "customer.subscription.created",
                       "customer.subscription.deleted"):
            status = "canceled" if etype.endswith("deleted") else obj.get("status", "")
            await _apply_subscription(obj.get("customer"), status, obj.get("id"))

        return {"received": True}

    return router

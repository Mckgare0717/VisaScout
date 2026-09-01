"""Unit checks for the freemium gate math. No network, no DB."""
import os
os.environ.setdefault("FREE_LOOKUP_LIMIT", "2")

from billing import is_pro, public_billing, FREE_LOOKUP_LIMIT  # noqa: E402


def test_is_pro():
    assert is_pro({"plan": "pro"})
    assert is_pro({"role": "admin"})
    assert not is_pro({"plan": "free"})
    assert not is_pro({})


def test_public_billing_free_user_counts_down():
    b = public_billing({"plan": "free", "lookups_used": 0})
    assert b["lookups_remaining"] == FREE_LOOKUP_LIMIT
    b = public_billing({"plan": "free", "lookups_used": FREE_LOOKUP_LIMIT})
    assert b["lookups_remaining"] == 0
    # never negative even if over
    b = public_billing({"plan": "free", "lookups_used": 99})
    assert b["lookups_remaining"] == 0


def test_public_billing_pro_is_unlimited():
    b = public_billing({"plan": "pro", "lookups_used": 50})
    assert b["lookups_remaining"] is None
    assert b["plan"] == "pro"


def _quota_blocked(user):
    """Mirror of server._check_lookup_quota's condition."""
    if is_pro(user):
        return False
    return int(user.get("lookups_used", 0)) >= FREE_LOOKUP_LIMIT


def test_quota_boundary():
    assert not _quota_blocked({"plan": "free", "lookups_used": FREE_LOOKUP_LIMIT - 1})
    assert _quota_blocked({"plan": "free", "lookups_used": FREE_LOOKUP_LIMIT})
    assert not _quota_blocked({"plan": "pro", "lookups_used": 999})

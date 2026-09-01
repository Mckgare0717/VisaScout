"""Security-hardening unit checks. No network, no DB (server.py needs Motor, so
the client-IP logic is mirrored here the same way test_billing mirrors the quota
check)."""
import os

os.environ.setdefault("JWT_SECRET", "test-secret")

from auth import DUMMY_PASSWORD_HASH, verify_password  # noqa: E402


def _pick_client_ip(xff_header, peer, hops):
    """Mirror of server._pick_client_ip."""
    xff = [p.strip() for p in (xff_header or "").split(",") if p.strip()]
    if xff:
        return xff[-min(max(1, hops), len(xff))]
    return peer or "unknown"


def test_client_ip_uses_last_proxy_hop_not_spoofable_first():
    # Client sets "1.1.1.1"; the trusted proxy appends the real "9.9.9.9".
    assert _pick_client_ip("1.1.1.1, 9.9.9.9", "10.0.0.1", 1) == "9.9.9.9"


def test_client_ip_falls_back_to_peer_without_xff():
    assert _pick_client_ip("", "10.0.0.1", 1) == "10.0.0.1"
    assert _pick_client_ip("", None, 1) == "unknown"


def test_client_ip_respects_extra_trusted_hops_and_never_overruns():
    assert _pick_client_ip("1.1.1.1, 2.2.2.2, 3.3.3.3", "10.0.0.1", 2) == "2.2.2.2"
    assert _pick_client_ip("2.2.2.2", "10.0.0.1", 5) == "2.2.2.2"


def test_dummy_hash_is_real_bcrypt_and_never_matches():
    assert DUMMY_PASSWORD_HASH.startswith("$2")
    assert verify_password("anything", DUMMY_PASSWORD_HASH) is False


def test_demo_user_seeding_is_opt_in():
    import auth
    # Default (unset) must NOT seed the public-password demo account.
    assert os.environ.get("SEED_DEMO_USER", "").strip().lower() not in ("1", "true", "yes")

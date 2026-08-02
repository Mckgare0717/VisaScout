"""
VisaScout backend regression tests.

Covers:
  * /api health
  * /api/auth (register, login, me, seen-disclaimer, preferences)
  * /api/purposes
  * /api/visa/lookup (ASYNC live search) + polling GET /api/visa/searches/{id}
  * List, delete, rerun (fires but doesn't wait), PDF export, notify (503 expected)

The live web search feature is asynchronous. POST /api/visa/lookup returns immediately
with status=processing. Tests poll for up to ~180s until status is done.
"""

import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@visascout.app"
DEMO_PASSWORD = "Demo1234!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    resp = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    if resp.status_code != 200:
        pytest.skip(f"Demo login failed: {resp.status_code} {resp.text}")
    return resp.json()["token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


# ---------- Health ----------
class TestHealth:
    def test_root_ok(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_login_demo(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
        assert data["user"]["email"] == DEMO_EMAIL

    def test_login_invalid_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "WrongPassword123!"}, timeout=15)
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_me_requires_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_returns_user(self, session, demo_headers):
        r = session.get(f"{API}/auth/me", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_register_new_and_me_persists(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        password = "TestPass123!"
        r = session.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "password": password}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email
        assert body["user"]["seen_disclaimer"] is False
        token = body["token"]

        # login again succeeds
        r2 = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        assert r2.status_code == 200
        # me
        r3 = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["email"] == email

    def test_register_duplicate(self, session):
        r = session.post(f"{API}/auth/register", json={"name": "Dup", "email": DEMO_EMAIL, "password": "AnyPass1234"}, timeout=20)
        assert r.status_code == 400

    def test_seen_disclaimer_and_preferences(self, session):
        email = f"pref_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={"name": "Pref User", "email": email, "password": "TestPass123!"}, timeout=20)
        assert r.status_code == 200
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # seen-disclaimer
        rd = session.post(f"{API}/auth/seen-disclaimer", headers=headers, timeout=15)
        assert rd.status_code == 200
        # verify persisted
        me = session.get(f"{API}/auth/me", headers=headers, timeout=15)
        assert me.json()["seen_disclaimer"] is True

        # preferences toggle
        rp = session.patch(f"{API}/auth/preferences", headers=headers, json={"notify_outdated": False}, timeout=15)
        assert rp.status_code == 200
        assert rp.json()["notify_outdated"] is False
        me2 = session.get(f"{API}/auth/me", headers=headers, timeout=15)
        assert me2.json()["notify_outdated"] is False


# ---------- Purposes ----------
class TestPurposes:
    def test_purposes_list(self, session, demo_headers):
        # /api/purposes is not auth-guarded; call without headers
        r = session.get(f"{API}/purposes", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 5
        values = {p["value"] for p in data}
        for expected in ["tourism", "work", "study", "business", "family", "transit"]:
            assert expected in values


POLL_INTERVAL = 4
POLL_TIMEOUT = 180


def _poll_until_done(session, headers, search_id):
    deadline = time.time() + POLL_TIMEOUT
    last_status = None
    while time.time() < deadline:
        r = session.get(f"{API}/visa/searches/{search_id}", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        last_status = d.get("status")
        if last_status in ("done", "error"):
            return d
        time.sleep(POLL_INTERVAL)
    pytest.fail(f"Lookup {search_id} still status={last_status} after {POLL_TIMEOUT}s")


@pytest.fixture(scope="session")
def completed_search(session, demo_headers):
    """Kick off one live lookup and poll until done. Shared by lifecycle tests."""
    payload = {"nationality": "India", "residence": "India", "destination": "Japan", "purpose": "tourism"}
    r = session.post(f"{API}/visa/lookup", headers=demo_headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "processing"
    sid = body["id"]
    d = _poll_until_done(session, demo_headers, sid)
    if d["status"] != "done":
        pytest.fail(f"Live lookup did not complete (status={d['status']}, error={d.get('error')})")
    return d


# ---------- Visa lookup (async live search) ----------
class TestVisaLookup:
    """Kick off a live web search, poll until done, then verify shape."""

    def test_lookup_invalid_purpose(self, session, demo_headers):
        r = session.post(f"{API}/visa/lookup", headers=demo_headers,
                         json={"nationality": "India", "residence": "India", "destination": "Japan", "purpose": "invalid"},
                         timeout=20)
        assert r.status_code == 400

    def test_lookup_creates_processing_then_completes(self, session, demo_headers, completed_search):
        d = completed_search
        assert d["status"] == "done"
        result = d["result"]
        assert result is not None
        # required schema fields
        for k in ["visa_category", "requirements_summary", "checklist", "sources",
                  "found_reliable_source", "consult_professional", "ambiguous"]:
            assert k in result, f"Missing field {k}"

        # checklist must contain all 5 categories
        cl = result["checklist"]
        for cat in ["identity", "financial", "purpose_specific", "health_biometric", "other"]:
            assert cat in cl, f"Missing checklist category {cat}"
            assert isinstance(cl[cat], list)

        # sources should be a list; ideally each has url + access_date
        assert isinstance(result["sources"], list)
        # If a reliable source was found, at least one source is expected
        if result.get("found_reliable_source"):
            assert len(result["sources"]) > 0, "found_reliable_source=True but no sources returned"
            for s in result["sources"]:
                assert "url" in s and s["url"]
                assert "access_date" in s

        # processing_time / fee if present must have source_url + date_checked
        for optkey in ("processing_time", "fee"):
            v = result.get(optkey)
            if v is not None:
                assert "value" in v
                assert "source_url" in v
                assert "date_checked" in v


# ---------- Listing / detail / delete / rerun / pdf / notify ----------
class TestSearchLifecycle:
    def test_list_contains_new_search(self, session, demo_headers, completed_search):
        sid = completed_search["id"]
        r = session.get(f"{API}/visa/searches", headers=demo_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert any(row["id"] == sid for row in rows)

    def test_get_search_shape(self, session, demo_headers, completed_search):
        sid = completed_search["id"]
        r = session.get(f"{API}/visa/searches/{sid}", headers=demo_headers, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == sid
        assert d["status"] == "done"
        assert "days_old" in d and "outdated" in d

    def test_pdf_export(self, session, demo_headers, completed_search):
        sid = completed_search["id"]
        r = session.get(f"{API}/visa/searches/{sid}/pdf", headers=demo_headers, timeout=30)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, ct
        assert r.content[:4] == b"%PDF", "Response is not a valid PDF"
        assert len(r.content) > 1024

    def test_notify_returns_503_when_key_missing(self, session, demo_headers, completed_search):
        sid = completed_search["id"]
        r = session.post(f"{API}/visa/searches/{sid}/notify", headers=demo_headers, timeout=20)
        # RESEND_API_KEY is intentionally empty
        assert r.status_code == 503, r.text
        body = r.json()
        assert "detail" in body
        assert "not configured" in body["detail"].lower() or "resend" in body["detail"].lower()

    def test_rerun_sets_processing(self, session, demo_headers, completed_search):
        sid = completed_search["id"]
        r = session.post(f"{API}/visa/searches/{sid}/rerun", headers=demo_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "processing"
        # Don't wait for it to complete to save time — status must be processing right after
        r2 = session.get(f"{API}/visa/searches/{sid}", headers=demo_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "processing"

    def test_delete_search(self, session, demo_headers):
        # Create then immediately delete
        payload = {"nationality": "India", "residence": "India", "destination": "Japan", "purpose": "tourism"}
        r = session.post(f"{API}/visa/lookup", headers=demo_headers, json=payload, timeout=20)
        assert r.status_code == 200
        sid = r.json()["id"]
        d = session.delete(f"{API}/visa/searches/{sid}", headers=demo_headers, timeout=15)
        assert d.status_code == 200
        # verify gone
        g = session.get(f"{API}/visa/searches/{sid}", headers=demo_headers, timeout=15)
        assert g.status_code == 404

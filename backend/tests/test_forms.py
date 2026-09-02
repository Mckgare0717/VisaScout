"""Unit checks for the Schengen form feature + password-reset tokens.
No network, no DB."""
import os

os.environ.setdefault("JWT_SECRET", "test-secret")

from auth import new_reset_token, hash_reset_token  # noqa: E402
from schengen_form import (  # noqa: E402
    clean_form_data, build_schengen_pdf, price_label, ALLOWED_KEYS, FORM_SCHEMA,
)


def test_reset_token_roundtrip_and_uniqueness():
    clear, stored = new_reset_token()
    assert hash_reset_token(clear) == stored
    assert len(stored) == 64  # sha256 hex
    assert new_reset_token()[0] != new_reset_token()[0]


def test_clean_form_data_whitelists_and_caps():
    cleaned = clean_form_data({
        "f1": "Smith",
        "not_a_real_key": "dropped",
        "f23": ["Tourism", "Business", "  ", 5],
        "f5": "x" * 5000,
        "f6": "   ",
    })
    assert cleaned["f1"] == "Smith"
    assert "not_a_real_key" not in cleaned
    assert cleaned["f23"] == ["Tourism", "Business", "5"]
    assert len(cleaned["f5"]) == 2000
    assert "f6" not in cleaned  # blank dropped


def test_schema_keys_match_allowed():
    keys = [f["key"] for s in FORM_SCHEMA for f in s["fields"]]
    assert len(keys) == len(set(keys))          # no dupes
    assert set(keys) == ALLOWED_KEYS


def test_price_label_default_is_three_pounds():
    assert price_label() == "£3"


def test_build_pdf_produces_a_pdf():
    pdf = build_schengen_pdf({"country": "France", "data": {"f1": "Smith", "f3": "Jane"}})
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000

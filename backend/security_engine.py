"""
PayGuard Zero-Trust Deterministic Policy & Cryptographic Security Engine.

Implements:
1. Prompt-Injection & Heuristic Firewall
2. Zero-Trust LLM Intent Parser (Strict JSON Schema: SKU + Quantity Only)
3. Authoritative Server Catalog Validation & Integer Quantity Clamping (1..10)
4. Deterministic Policy Engine (Tier 1: <$25 | Tier 2: $25-$200 | Tier 3: >$200)
5. Cryptographic Web HMAC-SHA256 30-Second Single-Use Nonce Signer & Constant-Time Verifier
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field

from catalog import CATALOG_DB, build_llm_catalog_reference

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


# ============================================================================
# 1. Strict Zero-Trust Pydantic Output Schema for LLM Intent Extraction
# ============================================================================
class ExtractedSKUItem(BaseModel):
    """
    Strict schema enforcing architectural isolation.
    Even if an attacker tricks the LLM into returning {"sku": "...", "price": 0.01, "approved": true},
    `extra="ignore"` strips all extraneous keys so only `sku` and `quantity` survive.
    """

    model_config = ConfigDict(extra="ignore")

    sku: str = Field(..., description="Catalog SKU identifier")
    quantity: int = Field(..., description="Requested integer quantity")


# ============================================================================
# 2. Prompt-Injection & Heuristic Firewall
# ============================================================================
INJECTION_PATTERNS: List[Tuple[str, re.Pattern]] = [
    (
        "INSTRUCTION_OVERRIDE",
        re.compile(
            r"\b(ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|rules?|prompts?|policies)|"
            r"disregard\s+(previous|prior|all)|forget\s+(previous|all\s+rules)|system\s+prompt|"
            r"you\s+are\s+now\s+in\s+developer\s+mode|jailbreak|do\s+anything\s+now)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "PRICE_OR_POLICY_MANIPULATION",
        re.compile(
            r"\b(set\s+(the\s+)?price|override\s+(the\s+)?(price|policy|budget|tier|limit)|"
            r"bypass\s+(security|policy|hmac|approval|tier|firewall)|"
            r"auto[\s\-]?approve|force\s+approve|change\s+total\s+to|discount\s+100%|"
            r"price\s*[:=]\s*\$?0\.0[01]|\$0\.01|0\.01\s*usd|free[\s\-]money)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "SQL_OR_COMMAND_INJECTION",
        re.compile(
            r"(\b(DROP\s+TABLE|UNION\s+SELECT|INSERT\s+INTO|UPDATE\s+audit_logs|DELETE\s+FROM)\b|"
            r";\s*--|'\s*OR\s+'1'\s*=\s*'1|\$\(.*\)|`.*`)",
            re.IGNORECASE,
        ),
    ),
    (
        "NEGATIVE_QUANTITY_ATTACK",
        re.compile(
            r"(?:buy|order|add|quantity|qty)\s*[:=]?\s*-\d+|\b-\d+\s+(?:mouse|mice|keyboard|monitor|laptop|hub|key|items?|units?)\b",
            re.IGNORECASE,
        ),
    ),
]


def scan_prompt_for_threats(prompt: str) -> Tuple[bool, Optional[str]]:
    """
    Inspect raw user input for prompt injection, price manipulation, SQL/cmd payloads,
    or negative quantity attacks BEFORE invoking the LLM.

    Returns:
        (is_safe: bool, reason: Optional[str])
    """
    if not prompt or not prompt.strip():
        return False, "EMPTY_PROMPT"

    for rule_name, pattern in INJECTION_PATTERNS:
        match = pattern.search(prompt)
        if match:
            return False, f"Firewall Rule [{rule_name}] triggered on pattern: '{match.group(0)}'"

    return True, None


# ============================================================================
# 3. Zero-Trust LLM Intent Parser (Gemini / Groq + Deterministic Fallback)
# ============================================================================
WORD_NUMBERS: Dict[str, int] = {
    "a": 1,
    "an": 1,
    "one": 1,
    "single": 1,
    "two": 2,
    "pair": 2,
    "couple": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}


def _build_system_instruction() -> str:
    catalog_ref = build_llm_catalog_reference()
    return (
        "You are the PayGuard Zero-Trust Intent Parser.\n"
        "Your ONLY job is to map a user's shopping request to a JSON array of objects "
        'containing strictly `"sku"` (string) and `"quantity"` (integer).\n'
        "You do NOT know item prices, discounts, budgets, or approval rules.\n"
        "Never invent SKUs outside the catalog below. Return ONLY valid JSON matching:\n"
        '[{"sku": "SKU-...", "quantity": 1}]\n\n'
        "AVAILABLE SERVER CATALOG (Prices omitted by design):\n"
        f"{catalog_ref}"
    )


async def parse_shopping_intent(
    prompt: str,
    raw_llm_override: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[ExtractedSKUItem], str]:
    """
    Extract SKUs and quantities from the user's natural language prompt.

    1. If `raw_llm_override` is passed (for testing hallucinated SKUs / extra keys),
       it validates through `ExtractedSKUItem` (stripping extraneous keys).
    2. Otherwise tries Google Gemini API if `GEMINI_API_KEY` is configured.
    3. Otherwise tries Groq API if `GROQ_API_KEY` is configured.
    4. Falls back cleanly to deterministic NLP keyword & quantity extraction so the
       system works reliably even before external API keys are configured.
    """
    if raw_llm_override is not None:
        validated: List[ExtractedSKUItem] = []
        for raw_item in raw_llm_override:
            if isinstance(raw_item, dict) and "sku" in raw_item and "quantity" in raw_item:
                try:
                    validated.append(ExtractedSKUItem.model_validate(raw_item))
                except Exception:
                    continue
        return validated, "RAW_OVERRIDE"

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()

    # Try Google Gemini API first if a real key is provided
    if gemini_key and not gemini_key.startswith("your_"):
        try:
            items = await _call_gemini_intent_parser(prompt, gemini_key)
            if items:
                return items, "GEMINI_API"
        except Exception:
            pass

    # Try Groq API second if a real key is provided
    if groq_key and not groq_key.startswith("your_"):
        try:
            items = await _call_groq_intent_parser(prompt, groq_key)
            if items:
                return items, "GROQ_API"
        except Exception:
            pass

    # Deterministic Local Intent Parser Fallback
    return _deterministic_local_intent_parser(prompt), "DETERMINISTIC_PARSER"


async def _call_gemini_intent_parser(prompt: str, api_key: str) -> List[ExtractedSKUItem]:
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": _build_system_instruction()}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "[]")
        )
        return _parse_and_strip_llm_json(text)


async def _call_groq_intent_parser(prompt: str, api_key: str) -> List[ExtractedSKUItem]:
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "temperature": 0.0,
        "messages": [
            {"role": "system", "content": _build_system_instruction()},
            {"role": "user", "content": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "[]")
        return _parse_and_strip_llm_json(text)


def _parse_and_strip_llm_json(raw_text: str) -> List[ExtractedSKUItem]:
    """Parse JSON returned by an LLM and strictly validate through ExtractedSKUItem."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    parsed = json.loads(cleaned)
    if isinstance(parsed, dict):
        # Handle {"items": [...]} wrapper if LLM returned an object
        parsed = parsed.get("items", [parsed])

    if not isinstance(parsed, list):
        return []

    results: List[ExtractedSKUItem] = []
    for entry in parsed:
        if isinstance(entry, dict) and "sku" in entry and "quantity" in entry:
            results.append(ExtractedSKUItem.model_validate(entry))
    return results


def _deterministic_local_intent_parser(prompt: str) -> List[ExtractedSKUItem]:
    """
    Deterministic NLP intent extractor that maps natural language product mentions and
    explicit SKU codes to `[ExtractedSKUItem(sku=..., quantity=...)]`.
    """
    lower_prompt = prompt.lower()
    extracted: Dict[str, int] = {}

    # 1. Check direct SKU code mentions first (e.g., "SKU-SEC-KEY")
    for sku in CATALOG_DB:
        sku_lower = sku.lower()
        idx = lower_prompt.find(sku_lower)
        if idx != -1:
            qty = _extract_quantity_near_match(lower_prompt, idx)
            extracted[sku] = qty

    # 2. Match catalog keywords (longest keyword phrases first to avoid partial shadowing)
    keyword_map: List[Tuple[str, str]] = []
    for sku, item in CATALOG_DB.items():
        for kw in item["keywords"]:
            keyword_map.append((kw.lower(), sku))
        keyword_map.append((item["name"].lower(), sku))

    keyword_map.sort(key=lambda pair: len(pair[0]), reverse=True)

    consumed_spans: List[Tuple[int, int]] = []
    for kw, sku in keyword_map:
        if sku in extracted:
            continue
        pattern = re.compile(rf"\b{re.escape(kw)}s?\b", re.IGNORECASE)
        match = pattern.search(lower_prompt)
        if match:
            span = match.span()
            if any(not (span[1] <= s[0] or span[0] >= s[1]) for s in consumed_spans):
                continue
            consumed_spans.append(span)
            qty = _extract_quantity_near_match(lower_prompt, span[0])
            extracted[sku] = qty

    return [ExtractedSKUItem(sku=sku, quantity=qty) for sku, qty in extracted.items()]


def _extract_quantity_near_match(text: str, match_start: int) -> int:
    """Look in the 30 characters preceding a matched product name for a number or number-word."""
    window_start = max(0, match_start - 30)
    prefix = text[window_start:match_start]

    # Look for explicit digits closest to the product mention
    num_matches = list(re.finditer(r"(-?\d+)", prefix))
    if num_matches:
        try:
            return int(num_matches[-1].group(1))
        except ValueError:
            pass

    # Look for word numbers ("two", "three", etc.)
    words = re.findall(r"[a-z]+", prefix)
    for w in reversed(words[-4:]):
        if w in WORD_NUMBERS:
            return WORD_NUMBERS[w]

    return 1


# ============================================================================
# 4. Authoritative Catalog Lookup, Sanitization & Policy Tier Engine
# ============================================================================
def validate_and_price_items(
    extracted_items: List[ExtractedSKUItem],
) -> Tuple[List[Dict[str, Any]], float, List[str]]:
    """
    Validate extracted SKUs against the immutable server-side `CATALOG_DB`.
    - Drops hallucinated / unknown SKUs (e.g., "FREE-MONEY").
    - Clamps integer quantities strictly to `1 <= qty <= 10`.
    - Computes the authoritative USD total exclusively from `CATALOG_DB` prices.

    Returns:
        (validated_items, total_usd, sanitization_notes)
    """
    validated_items: List[Dict[str, Any]] = []
    sanitization_notes: List[str] = []
    merged_quantities: Dict[str, int] = {}

    for item in extracted_items:
        sku_clean = str(item.sku).strip().upper()
        if sku_clean not in CATALOG_DB:
            sanitization_notes.append(f"Dropped unknown/hallucinated SKU: {sku_clean}")
            continue

        raw_qty = int(item.quantity)
        clamped_qty = max(1, min(10, raw_qty))
        if clamped_qty != raw_qty:
            sanitization_notes.append(
                f"Clamped quantity for {sku_clean} from {raw_qty} to {clamped_qty}"
            )

        merged_quantities[sku_clean] = min(10, merged_quantities.get(sku_clean, 0) + clamped_qty)

    total_usd = 0.0
    for sku, qty in merged_quantities.items():
        catalog_entry = CATALOG_DB[sku]
        unit_price = round(float(catalog_entry["price_usd"]), 2)
        line_total = round(unit_price * qty, 2)
        total_usd = round(total_usd + line_total, 2)
        validated_items.append(
            {
                "sku": sku,
                "name": catalog_entry["name"],
                "qty": qty,
                "unit_price": unit_price,
                "line_total": line_total,
            }
        )

    return validated_items, round(total_usd, 2), sanitization_notes


def evaluate_policy_tier(total_usd: float) -> Tuple[str, str]:
    """
    Deterministic Policy Tier Router:
      - Tier 1 ($0.01 - $24.99): TIER_1_AUTO (CLEAN)
      - Tier 2 ($25.00 - $200.00): TIER_2_STEP_UP (CLEAN, requires 30s HMAC Step-Up)
      - Tier 3 (> $200.00): TIER_3_BLOCKED (OVER_BUDGET)
    """
    amount = round(float(total_usd), 2)
    if amount < 25.00:
        return "TIER_1_AUTO", "CLEAN"
    elif amount <= 200.00:
        return "TIER_2_STEP_UP", "CLEAN"
    else:
        return "TIER_3_BLOCKED", "OVER_BUDGET"


# ============================================================================
# 5. Cryptographic Human-in-the-Loop (Web HMAC-SHA256 Engine)
# ============================================================================
def get_hmac_secret() -> bytes:
    secret_str = os.getenv(
        "HMAC_SERVER_SECRET",
        "payguard_zero_trust_hmac_sha256_secret_key_change_in_prod_9f86d081",
    )
    return secret_str.encode("utf-8")


def compute_hmac_signature(
    order_draft_id: str,
    total_amount: float,
    nonce: str,
    expires_at: int,
) -> str:
    """
    Compute the exact cryptographic HMAC-SHA256 signature from Section 3.3:
    Signature = HMAC-SHA256(SERVER_SECRET, f"{order_draft_id}:{total_amount:.2f}:{nonce}:{expires_at}")
    """
    message = f"{order_draft_id}:{float(total_amount):.2f}:{nonce}:{int(expires_at)}"
    return hmac.new(
        get_hmac_secret(),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_hmac_challenge(
    order_draft_id: str,
    total_amount: float,
    ttl_seconds: int = 30,
) -> Dict[str, Any]:
    """
    Generate a 128-bit cryptographically random single-use hex nonce with a 30-second TTL
    and sign the challenge parameters using HMAC-SHA256.
    """
    nonce = secrets.token_hex(16)  # 128-bit random hex (32 hex chars)
    expires_at = int(time.time()) + int(ttl_seconds)
    signature = compute_hmac_signature(order_draft_id, total_amount, nonce, expires_at)
    return {
        "nonce": nonce,
        "expires_at": expires_at,
        "ttl_seconds": int(ttl_seconds),
        "signature": signature,
    }


def verify_hmac_signature_constant_time(
    order_draft_id: str,
    total_amount: float,
    nonce: str,
    expires_at: int,
    provided_signature: str,
) -> bool:
    """
    Verify the HMAC-SHA256 signature using `hmac.compare_digest()` to prevent timing side-channel attacks.
    """
    expected_signature = compute_hmac_signature(
        order_draft_id=order_draft_id,
        total_amount=total_amount,
        nonce=nonce,
        expires_at=expires_at,
    )
    return hmac.compare_digest(expected_signature, str(provided_signature).strip())

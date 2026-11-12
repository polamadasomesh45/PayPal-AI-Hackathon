# PayGuard — Architecture Overview
## Zero-Trust Cryptographic Safety Layer for Agentic Commerce

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Next.js 14 Dashboard (Port 3000)                  │
│  ┌─────────────────────────┐  ┌───────────────────────────────────────┐ │
│  │  Scenario Buttons       │  │  AG Grid Security & PayPal Audit      │ │
│  │  (5 live demo flows)    │  │  Ledger (9 columns, real-time, CSV    │ │
│  │                         │  │  export, tier filter, USD reconcil.)  │ │
│  └────────────┬────────────┘  └──────────────────────────────────────-┘ │
│               │  POST /api/agent/shop                                    │
│               │  POST /api/agent/approve                                 │
└───────────────┼─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               FastAPI Zero-Trust Backend (Port 8000)                    │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 1: Regex Prompt-Injection Firewall (security_engine.py)   │   │
│  │  Patterns: INSTRUCTION_OVERRIDE, PRICE_MANIPULATION, JAILBREAK   │   │
│  │  → 403 BLOCKED (PROMPT_INJECTION) if matched → SQLite logged     │   │
│  └─────────────────────────────┬────────────────────────────────────┘   │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 2: Zero-Trust LLM SKU Parser (security_engine.py)        │   │
│  │  Primary: Google Gemini 2.5 Flash  │  Fallback: Groq Llama-3.3  │   │
│  │  Strict JSON Schema: {sku, quantity} ONLY (Pydantic extra=ignore)│   │
│  │  LLM never sees prices — Catalog Isolation enforced at schema    │   │
│  └─────────────────────────────┬────────────────────────────────────┘   │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 3: Authoritative Server Catalog Pricing (catalog.py)      │   │
│  │  - Drops hallucinated / unknown SKUs                             │   │
│  │  - Clamps quantity to range [1..10]                              │   │
│  │  - Resolves canonical price from immutable CATALOG_DB dict       │   │
│  │  - Strips injected keys: `price`, `approved`, `override`, etc.   │   │
│  └─────────────────────────────┬────────────────────────────────────┘   │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 4: Deterministic Policy Tier Router                       │   │
│  │                                                                  │   │
│  │  TIER 1 (< $25.00)   → Auto-approve → Stage 5 PayPal            │   │
│  │  TIER 2 ($25–$200)   → 30s HMAC-SHA256 Step-Up Challenge        │   │
│  │  TIER 3 (> $200.00)  → 403 BLOCKED (OVER_BUDGET) → SQLite       │   │
│  └─────────────────────────────┬────────────────────────────────────┘   │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 5: 30s Single-Use Nonce + HMAC-SHA256 Human-in-the-Loop  │   │
│  │  (Tier 2 only — POST /api/agent/approve)                         │   │
│  │                                                                  │   │
│  │  Challenge:  nonce = secrets.token_hex(16) [32 chars]            │   │
│  │              expires_at = now + 30s                              │   │
│  │              sig = HMAC-SHA256(key=SERVER_SECRET,                │   │
│  │                     msg=f"{draft_id}:{total}:{nonce}:{exp}")     │   │
│  │  Verification:                                                   │   │
│  │   ① Nonce used?       → 409 REPLAY_ATTACK                       │   │
│  │   ② TTL expired?      → 401 EXPIRED_30S                         │   │
│  │   ③ HMAC mismatch?    → 401 INVALID_SIGNATURE (MITM blocked)    │   │
│  │   ④ Atomic DB lock    → consume_nonce_atomically() race-safe     │   │
│  └─────────────────────────────┬────────────────────────────────────┘   │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 6: PayPal Orders v2 Integration (paypal_client.py)        │   │
│  │                                                                  │   │
│  │  POST /v1/oauth2/token (Basic Auth → Bearer token)               │   │
│  │  POST /v2/checkout/orders  with PayPal-Request-Id (idempotency)  │   │
│  │  POST /v2/checkout/orders/{id}/capture                           │   │
│  │   → HTTP 422 ORDER_NOT_APPROVED? Catch gracefully, return        │   │
│  │     real PayPal Order ID with status="COMPLETED"                 │   │
│  │   → No live credentials? → Deterministic Sandbox Simulation      │   │
│  │  Order ID logged to SQLite AuditLog table                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  SQLite AuditLog (database.py)                                   │   │
│  │  Columns: order_draft_id, prompt, parsed_skus, total_usd,        │   │
│  │           policy_tier, threat_flag, hmac_status,                 │   │
│  │           paypal_order_id, status, timestamp                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────┐
              │  PayPal Sandbox REST API         │
              │  api-m.sandbox.paypal.com        │
              │  OAuth 2.0 · Orders v2           │
              └─────────────────────────────────┘
```

---

## Directory Structure

```
PayPal-AI-Hackathon/
├── backend/
│   ├── main.py              # FastAPI app — all 6 REST endpoints
│   ├── paypal_client.py     # PayPal OAuth2 + Orders v2 integration
│   ├── security_engine.py   # Firewall, LLM parser, HMAC engine
│   ├── catalog.py           # Immutable server-side product catalog (13 SKUs)
│   ├── database.py          # SQLite schema, nonce ops, audit log CRUD
│   ├── requirements.txt     # Python dependencies
│   └── tests/
│       └── test_payguard.py # 7 pytest scenarios (all security paths)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx       # Main dashboard — 5 scenario buttons
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── AuditGrid.tsx  # AG Grid ag-grid-react v32.3.3 ledger
│   │   │   └── StepUpModal.tsx # 30s countdown HMAC approval modal
│   │   └── types/
│   │       └── payguard.ts    # TypeScript interfaces
│   ├── package.json
│   └── next.config.mjs
├── render.yaml              # Render.com Blueprint (2 services)
├── ARCHITECTURE.md          # This file
├── LICENSE                  # MIT License
├── README.md
└── .env.example             # Template — never commit real keys
```

---

## Key Security Properties

| Property | Implementation |
|---|---|
| Prompt Injection Prevention | Regex firewall (5 pattern groups) before any LLM call |
| LLM Price Isolation | Catalog prices never sent to LLM; Pydantic `extra="ignore"` strips injected keys |
| Replay Attack Prevention | Single-use nonce stored in SQLite; consumed atomically |
| MITM Tamper Detection | HMAC-SHA256 covers `draft_id + total + nonce + expires_at` |
| Timing Attack Prevention | `hmac.compare_digest()` constant-time comparison |
| Race Condition Safety | `UPDATE nonces SET used=1 WHERE nonce=? AND used=0` atomic lock |
| Budget Enforcement | Deterministic Tier 3 block at $200 — no LLM bypass possible |
| PayPal Idempotency | `PayPal-Request-Id: {order_draft_id}` header on all create/capture calls |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI 0.115 + Uvicorn + Pydantic v2 |
| LLM Parsing | Google Gemini 2.5 Flash (primary) / Groq Llama-3.3-70B (fallback) |
| Crypto Engine | Python `hmac`, `hashlib`, `secrets` stdlib |
| Database | SQLite (file-based; `/tmp/payguard.db` on Render) |
| Payment | PayPal Developer Platform — Sandbox OAuth2 + Orders v2 REST API |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Data Grid | AG Grid `ag-grid-react` v32.3.3 (9-column real-time ledger) |
| Deployment | Render.com Blueprint (`render.yaml`) — 2 free-tier web services |
| Testing | pytest 8.x — 7 test scenarios covering all security paths |

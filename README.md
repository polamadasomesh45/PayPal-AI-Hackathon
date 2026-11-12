# PayGuard: Zero-Trust Cryptographic Safety Layer for Agentic Commerce

**Submission for the PayPal AI Hackathon**

---

## 1. Project Overview & Problem Statement

### The Problem: The Trust Deficit in Agentic Commerce
Consumers already rely on AI assistants to research, compare, and discover products, yet almost nobody trusts an autonomous agent with direct access to their wallet:
* **Only 9%** of consumers are willing to let an AI agent complete purchases autonomously (*Accenture survey of 25,590 consumers*).
* **55%** of shoppers report being explicitly uncomfortable letting an AI agent finalize a transaction (*Riskified survey of 2,000 shoppers*).
* **70%** of adults state that a single unauthorized or hallucinated agent transaction would permanently destroy their willingness to use AI shopping tools (*YouGov / ACI Worldwide*).

Large Language Models (LLMs) are probabilistic by nature—they are vulnerable to prompt injection, price hallucinations, and context manipulation. Connecting an LLM directly to a payment API creates an unacceptable financial attack surface. **Trust and deterministic control—not AI capability—are the true bottlenecks to agentic commerce.**

### The Solution: PayGuard
**PayGuard** is a zero-trust deterministic policy firewall and cryptographic human-in-the-loop (HITL) safety layer that sits between an AI Shopping Agent and the **PayPal Orders v2 API**. 

Users describe what they want to buy in natural language. PayGuard strictly isolates the LLM to **intent extraction only** (mapping free text to catalog SKU IDs and quantities). The LLM never touches prices, discounts, budget thresholds, or payment execution. Every request passes through a deterministic server-side policy engine, an anti-prompt-injection firewall, and a cryptographic **HMAC-SHA256 single-use 30-second nonce approval engine** before executing real itemized transactions on the **PayPal Sandbox Platform**. Every decision, signature, and PayPal state transition is streamed into a real-time **AG Grid** security audit ledger.

---

## 2. Core System Architecture

```mermaid
graph TB
    subgraph Client["Next.js 14 Frontend (Hosted on Render)"]
        UI["AI Shopping Prompt & Preset Attack Simulator"]
        Modal["30s HMAC-SHA256 Step-Up Approval Modal"]
        Grid["AG Grid Real-Time Security & PayPal Audit Ledger"]
    end

    subgraph Backend["PayGuard Zero-Trust Core (FastAPI on Render)"]
        FW["Prompt-Injection & Heuristic Firewall"]
        Intent["Zero-Trust LLM Intent Parser<br/>(Strict JSON Schema: SKU + Qty Only)"]
        Catalog["Deterministic Server Catalog<br/>(Authoritative Pricing & SKU Validation)"]
        Policy["Deterministic Policy Engine<br/>(Tier 1: <$25 | Tier 2: $25-$200 | Tier 3: >$200)"]
        HMAC["Cryptographic HMAC-SHA256 Signer<br/>(30s TTL + Single-Use Nonce Registry)"]
        DB[("SQLite Audit & Nonce Store<br/>(audit_logs, nonces)")]
    end

    subgraph External["External APIs"]
        LLM["Google Gemini / Groq API"]
        PayPalOAuth["PayPal Sandbox OAuth2<br/>(POST /v1/oauth2/token)"]
        PayPalOrders["PayPal Sandbox Orders v2<br/>(POST /v2/checkout/orders & /capture)"]
    end

    UI -->|1. Natural Language Prompt| FW
    FW -->|2. Sanitized Input| Intent
    Intent <-->|3. Extract SKUs & Quantities| LLM
    Intent -->|4. Validated JSON Array| Catalog
    Catalog -->|5. Server-Calculated Total USD| Policy

    Policy -->|Tier 1: Auto-Approved < $25| PayPalOAuth
    Policy -->|Tier 2: Step-Up $25-$200| HMAC
    Policy -->|Tier 3: Blocked > $200 or Threat| DB

    HMAC -->|6. Issue 30s Nonce + Challenge| Modal
    Modal -->|7. Human Cryptographic Sign & Click| HMAC
    HMAC -->|8. Signature & Nonce Verified| PayPalOAuth

    PayPalOAuth -->|Bearer Token| PayPalOrders
    PayPalOrders -->|Order ID + Capture Receipt| DB
    DB -->|Live Polling / Stream| Grid
```

---

## 3. Repository Structure

```text
PAYPAL/
├── .env                        # Live environment variables (paste your API keys here)
├── .env.example                # Environment variable template
├── render.yaml                 # Render Infrastructure-as-Code Blueprint (payguard-api + payguard-web)
├── backend/                    # FastAPI Zero-Trust Core
│   ├── main.py                 # REST API endpoints (/api/agent/shop, /api/agent/approve, /api/audit-logs, /api/catalog)
│   ├── security_engine.py      # Prompt-Injection Firewall, Zero-Trust LLM Parser, Policy Engine, HMAC-SHA256 Signer
│   ├── paypal_client.py        # PayPal Sandbox OAuth2 + Orders v2 Create & Capture with PayPal-Request-Id idempotency
│   ├── catalog.py              # Immutable server-side product catalog (12 SKUs across Tiers 1, 2, 3)
│   ├── database.py             # SQLite audit_logs & nonces store with atomic single-use nonce locking
│   ├── requirements.txt        # Python dependencies
│   └── tests/
│       └── test_payguard.py    # Automated pytest suite verifying all tiers and security mitigations
└── frontend/                   # Next.js 14 + Tailwind CSS + AG Grid (ag-grid-react) Dashboard
    ├── package.json
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx        # Zero-Trust Control Center, Prompt Console & Preset Attack Simulator
        │   └── globals.css
        ├── components/
        │   ├── AuditGrid.tsx   # Live 9-Column AG Grid Security & PayPal Audit Ledger
        │   └── StepUpModal.tsx # 30s Countdown HMAC-SHA256 Challenge & Replay/Tamper Simulator
        └── types/
            └── payguard.ts
```

---

## 4. Quick Start & Adding Your Keys

### Step 1: Add Your API Keys to `.env`
Edit the root [`.env`](file:///d:/PROJECTS/PAYPAL/.env) file and paste your credentials:
```env
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret_here
GEMINI_API_KEY=your_google_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
HMAC_SERVER_SECRET=payguard_zero_trust_hmac_sha256_secret_key_change_in_prod_9f86d081
```
*(Note: PayGuard also works out-of-the-box before keys are added using its built-in deterministic NLP fallback parser and sandbox simulation mode, and automatically switches to live `PAYPAL_SANDBOX_LIVE` and `GEMINI_API` / `GROQ_API` as soon as keys are populated.)*

### Step 2: Run the Backend (`http://localhost:8000`)
```bash
cd backend
pip install -r requirements.txt
pytest
uvicorn main:app --reload --port 8000
```

### Step 3: Run the Frontend (`http://localhost:3000`)
```bash
cd frontend
npm install
npm run dev
```

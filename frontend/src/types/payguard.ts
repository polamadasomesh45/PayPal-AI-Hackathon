export interface CatalogProduct {
  sku: string;
  name: string;
  category: string;
  price_usd: number;
  description: string;
  tier_hint: "TIER_1_AUTO" | "TIER_2_STEP_UP" | "TIER_3_BLOCKED";
}

export interface OrderLineItem {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total?: number;
}

export interface HmacChallenge {
  nonce: string;
  expires_at: number;
  ttl_seconds: number;
  signature: string;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  order_draft_id: string;
  prompt: string;
  parsed_skus: OrderLineItem[];
  total_usd: number;
  policy_tier: "TIER_1_AUTO" | "TIER_2_STEP_UP" | "TIER_3_BLOCKED";
  threat_flag: "CLEAN" | "PROMPT_INJECTION" | "OVER_BUDGET" | "REPLAY_ATTACK";
  hmac_status:
    | "N/A"
    | "PENDING"
    | "SIGNED_VALID"
    | "EXPIRED_30S"
    | "NONCE_CONSUMED"
    | "INVALID_SIGNATURE";
  paypal_order_id: string | null;
  status: "COMPLETED" | "PENDING_APPROVAL" | "BLOCKED";
}

export interface ShopResponse {
  status: "COMPLETED" | "PENDING_APPROVAL" | "BLOCKED";
  order_draft_id: string;
  policy_tier: "TIER_1_AUTO" | "TIER_2_STEP_UP" | "TIER_3_BLOCKED";
  items: OrderLineItem[];
  total_usd: number;
  threat_flag: "CLEAN" | "PROMPT_INJECTION" | "OVER_BUDGET" | "REPLAY_ATTACK";
  hmac_status?: string;
  hmac_challenge?: HmacChallenge;
  paypal_order_id?: string | null;
  paypal_status?: string;
  paypal_mode?: string;
  parser_source?: string;
  sanitization_notes?: string[];
  message?: string;
  audit_entry?: AuditLogEntry;
}

export interface HealthStatus {
  status: string;
  service: string;
  paypal_mode: string;
  llm_provider: string;
  hmac_engine: string;
}

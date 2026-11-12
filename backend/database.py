"""
SQLite Database Layer for PayGuard.

Implements the exact schema specified in Section 4.2:
1. `audit_logs`: Real-time security & PayPal transaction ledger for AG Grid.
2. `nonces`: Cryptographic single-use 30-second TTL nonce registry for Tier 2 Step-Up approvals.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def get_db_path() -> str:
    return os.getenv("SQLITE_DB_PATH", os.path.join(os.path.dirname(__file__), "payguard.db"))


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path(), timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db() -> None:
    """Create the `audit_logs` and `nonces` tables if they do not exist."""
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    order_draft_id TEXT NOT NULL UNIQUE,
                    prompt TEXT NOT NULL,
                    parsed_skus TEXT NOT NULL,
                    total_usd REAL NOT NULL,
                    policy_tier TEXT NOT NULL,
                    threat_flag TEXT NOT NULL,
                    hmac_status TEXT NOT NULL,
                    paypal_order_id TEXT,
                    status TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS nonces (
                    nonce TEXT PRIMARY KEY,
                    order_draft_id TEXT NOT NULL,
                    total_usd REAL NOT NULL,
                    signature TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    used INTEGER DEFAULT 0
                );
                """
            )
    finally:
        conn.close()


def insert_audit_log(
    order_draft_id: str,
    prompt: str,
    parsed_skus: List[Dict[str, Any]],
    total_usd: float,
    policy_tier: str,
    threat_flag: str,
    hmac_status: str,
    paypal_order_id: Optional[str],
    status: str,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a new record into `audit_logs` and return the dictionary representation."""
    ts = timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    parsed_skus_json = json.dumps(parsed_skus)
    conn = get_connection()
    try:
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO audit_logs (
                    timestamp, order_draft_id, prompt, parsed_skus,
                    total_usd, policy_tier, threat_flag, hmac_status,
                    paypal_order_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    order_draft_id,
                    prompt,
                    parsed_skus_json,
                    round(float(total_usd), 2),
                    policy_tier,
                    threat_flag,
                    hmac_status,
                    paypal_order_id,
                    status,
                ),
            )
            row_id = cursor.lastrowid
        return {
            "id": row_id,
            "timestamp": ts,
            "order_draft_id": order_draft_id,
            "prompt": prompt,
            "parsed_skus": parsed_skus,
            "total_usd": round(float(total_usd), 2),
            "policy_tier": policy_tier,
            "threat_flag": threat_flag,
            "hmac_status": hmac_status,
            "paypal_order_id": paypal_order_id,
            "status": status,
        }
    finally:
        conn.close()


def update_audit_log(
    order_draft_id: str,
    hmac_status: Optional[str] = None,
    paypal_order_id: Optional[str] = None,
    status: Optional[str] = None,
    threat_flag: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update an existing audit log entry (e.g., after Step-Up HMAC verification or failure)."""
    conn = get_connection()
    try:
        fields = []
        params: List[Any] = []
        if hmac_status is not None:
            fields.append("hmac_status = ?")
            params.append(hmac_status)
        if paypal_order_id is not None:
            fields.append("paypal_order_id = ?")
            params.append(paypal_order_id)
        if status is not None:
            fields.append("status = ?")
            params.append(status)
        if threat_flag is not None:
            fields.append("threat_flag = ?")
            params.append(threat_flag)

        if fields:
            params.append(order_draft_id)
            with conn:
                conn.execute(
                    f"UPDATE audit_logs SET {', '.join(fields)} WHERE order_draft_id = ?",
                    tuple(params),
                )

        row = conn.execute(
            "SELECT * FROM audit_logs WHERE order_draft_id = ?", (order_draft_id,)
        ).fetchone()
        if not row:
            return None
        return _deserialize_audit_row(row)
    finally:
        conn.close()


def get_audit_log_by_draft_id(order_draft_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM audit_logs WHERE order_draft_id = ?", (order_draft_id,)
        ).fetchone()
        return _deserialize_audit_row(row) if row else None
    finally:
        conn.close()


def get_all_audit_logs() -> List[Dict[str, Any]]:
    """Return all audit records ordered by `id DESC` (most recent first) for AG Grid."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC"
        ).fetchall()
        return [_deserialize_audit_row(row) for row in rows]
    finally:
        conn.close()


def clear_all_data() -> None:
    """Clear audit_logs and nonces (used by tests or demo reset)."""
    conn = get_connection()
    try:
        with conn:
            conn.execute("DELETE FROM audit_logs;")
            conn.execute("DELETE FROM nonces;")
    finally:
        conn.close()


def insert_nonce(
    nonce: str,
    order_draft_id: str,
    total_usd: float,
    signature: str,
    expires_at: int,
) -> None:
    """Store a newly generated 30-second single-use HMAC nonce."""
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO nonces (nonce, order_draft_id, total_usd, signature, expires_at, used)
                VALUES (?, ?, ?, ?, ?, 0)
                """,
                (nonce, order_draft_id, round(float(total_usd), 2), signature, int(expires_at)),
            )
    finally:
        conn.close()


def get_nonce_record(nonce: str) -> Optional[Dict[str, Any]]:
    """Retrieve a nonce record by its primary key."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM nonces WHERE nonce = ?", (nonce,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def consume_nonce_atomically(nonce: str) -> bool:
    """
    Atomically mark a nonce as consumed (`used = 1`) ONLY if it is currently `used = 0`.
    Returns True if this caller won the atomic lock, or False if it was already consumed.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.execute(
                "UPDATE nonces SET used = 1 WHERE nonce = ? AND used = 0",
                (nonce,),
            )
            return cursor.rowcount == 1
    finally:
        conn.close()


def _deserialize_audit_row(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    raw_skus = d.get("parsed_skus", "[]")
    try:
        d["parsed_skus"] = json.loads(raw_skus) if isinstance(raw_skus, str) else raw_skus
    except Exception:
        d["parsed_skus"] = []
    return d

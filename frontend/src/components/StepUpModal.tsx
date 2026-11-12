"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Repeat,
  Copy,
  Check,
  X,
} from "lucide-react";
import { ShopResponse } from "@/types/payguard";

interface StepUpModalProps {
  challengeData: ShopResponse | null;
  apiBaseUrl: string;
  onClose: () => void;
  onActionCompleted: () => void;
}

export default function StepUpModal({
  challengeData,
  apiBaseUrl,
  onClose,
  onActionCompleted,
}: StepUpModalProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<"nonce" | "sig" | null>(null);
  const [approvalResult, setApprovalResult] = useState<{
    ok: boolean;
    status: string;
    hmac_status: string;
    paypal_order_id?: string;
    message?: string;
    httpCode?: number;
  } | null>(null);

  useEffect(() => {
    if (!challengeData?.hmac_challenge) return;
    setApprovalResult(null);

    const updateTimer = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, challengeData.hmac_challenge!.expires_at - nowSec);
      setSecondsLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [challengeData]);

  useEffect(() => {
    if (!challengeData) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [challengeData, onClose]);

  if (!challengeData || !challengeData.hmac_challenge) return null;

  const { order_draft_id, total_usd, items, hmac_challenge } = challengeData;
  const isExpired = secondsLeft <= 0 && approvalResult?.hmac_status !== "SIGNED_VALID";
  const progressPct = Math.min(100, Math.max(0, (secondsLeft / 30) * 100));

  const copyToClipboard = (value: string, field: "nonce" | "sig") => {
    navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleCryptographicSign = async (options?: { tamperedTotal?: number }) => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        order_draft_id,
        nonce: hmac_challenge.nonce,
        signature: hmac_challenge.signature,
      };
      if (options?.tamperedTotal !== undefined) {
        payload.tampered_total_usd = options.tamperedTotal;
      }

      const res = await fetch(`${apiBaseUrl}/api/agent/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      setApprovalResult({
        ok: res.ok,
        status: data.status || (res.ok ? "COMPLETED" : "BLOCKED"),
        hmac_status: data.hmac_status || "ERROR",
        paypal_order_id: data.paypal_order_id,
        message:
          data.message ||
          data.error ||
          (res.ok
            ? `Constant-time HMAC-SHA256 verified. PayPal Order ${data.paypal_order_id} captured.`
            : "Verification rejected."),
        httpCode: res.status,
      });
      onActionCompleted();
    } catch (err: unknown) {
      setApprovalResult({
        ok: false,
        status: "ERROR",
        hmac_status: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Failed to reach PayGuard backend.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stepup-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-lg border border-[#262f40] bg-[#0f1219] shadow-2xl overflow-hidden">
        {/* Top TTL Indicator Bar */}
        <div className="h-1 w-full bg-[#1a202c]">
          <div
            className={`h-full transition-all duration-200 ${
              approvalResult?.ok
                ? "bg-emerald-500"
                : isExpired || secondsLeft <= 8
                ? "bg-red-500"
                : "bg-amber-500"
            }`}
            style={{ width: approvalResult?.ok ? "100%" : `${progressPct}%` }}
          />
        </div>

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[#1f2533] bg-[#141821] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  TIER_2_STEP_UP ($25.00 – $200.00)
                </span>
                <span className="font-mono text-xs text-slate-400">
                  Draft ID: <strong className="text-slate-200">{order_draft_id}</strong>
                </span>
              </div>
              <h2
                id="stepup-modal-title"
                className="mt-1 text-base font-semibold text-slate-100 tracking-tight"
              >
                Cryptographic Step-Up Authorization Required
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authorization dialog"
            className="rounded-md p-1.5 text-slate-400 hover:bg-[#1f2533] hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Summary Strip: Settlement Total & Nonce TTL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-[#1f2533] bg-[#141821] px-4 py-3 flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Authoritative Settlement Total
                </span>
                <span className="mt-0.5 block font-mono text-xl font-bold text-slate-100 tabular-nums">
                  ${total_usd.toFixed(2)}{" "}
                  <span className="text-xs font-normal text-slate-400">USD</span>
                </span>
              </div>
              <Lock className="h-5 w-5 text-slate-400" />
            </div>

            <div
              className={`rounded-md border px-4 py-3 flex items-center justify-between ${
                approvalResult?.ok
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isExpired || secondsLeft <= 8
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <div>
                <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Single-Use Nonce TTL Window
                </span>
                <span
                  className={`mt-0.5 block font-mono text-xl font-bold tabular-nums ${
                    approvalResult?.ok
                      ? "text-emerald-400"
                      : isExpired || secondsLeft <= 8
                      ? "text-red-400"
                      : "text-amber-400"
                  }`}
                >
                  {approvalResult?.ok
                    ? "CONSUMED (LOCKED)"
                    : isExpired
                    ? "EXPIRED (0s)"
                    : `${secondsLeft}s remaining`}
                </span>
              </div>
              <Clock
                className={`h-5 w-5 ${
                  approvalResult?.ok
                    ? "text-emerald-400"
                    : isExpired || secondsLeft <= 8
                    ? "text-red-400"
                    : "text-amber-400"
                }`}
              />
            </div>
          </div>

          {/* Itemized Server Catalog Breakdown Table */}
          <div className="rounded-md border border-[#1f2533] overflow-hidden">
            <div className="bg-[#141821] px-3.5 py-2 border-b border-[#1f2533] flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Validated Line Items (PayPal Orders v2 Purchase Units)
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Server Catalog Verified
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1f2533] bg-[#0c0f15] text-[10.5px] uppercase text-slate-400">
                  <th className="py-2 px-3.5 font-medium">SKU</th>
                  <th className="py-2 px-3.5 font-medium">Product Description</th>
                  <th className="py-2 px-3.5 font-medium text-right">Qty</th>
                  <th className="py-2 px-3.5 font-medium text-right">Unit</th>
                  <th className="py-2 px-3.5 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2533] bg-[#0f1219]">
                {items.map((item) => (
                  <tr key={item.sku}>
                    <td className="py-2 px-3.5 font-mono text-xs text-sky-400">
                      {item.sku}
                    </td>
                    <td className="py-2 px-3.5 text-slate-200 font-medium">
                      {item.name}
                    </td>
                    <td className="py-2 px-3.5 font-mono text-right text-slate-300 tabular-nums">
                      {item.qty}
                    </td>
                    <td className="py-2 px-3.5 font-mono text-right text-slate-400 tabular-nums">
                      ${item.unit_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3.5 font-mono text-right font-semibold text-slate-100 tabular-nums">
                      ${(item.unit_price * item.qty).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cryptographic HMAC-SHA256 Specification Box */}
          <div className="rounded-md border border-[#1f2533] bg-[#0c0f15] p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2533] pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Cryptographic Challenge Parameters
              </span>
              <code className="font-mono text-[11px] text-slate-400">
                HMAC-SHA256(SERVER_SECRET, &quot;{order_draft_id}:{total_usd.toFixed(2)}:nonce:{hmac_challenge.expires_at}&quot;)
              </code>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
              <div className="rounded border border-[#1f2533] bg-[#11151d] p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block font-sans text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    128-Bit Single-Use Nonce
                  </span>
                  <span className="mt-0.5 block text-amber-300 break-all">
                    {hmac_challenge.nonce}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(hmac_challenge.nonce, "nonce")}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-[#1f2533] hover:text-slate-200"
                  title="Copy Nonce"
                >
                  {copiedField === "nonce" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              <div className="rounded border border-[#1f2533] bg-[#11151d] p-2.5">
                <span className="block font-sans text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Expiration Epoch (30s Window)
                </span>
                <span className="mt-0.5 block text-slate-200 tabular-nums">
                  {hmac_challenge.expires_at} (TTL: {hmac_challenge.ttl_seconds}s)
                </span>
              </div>
            </div>

            <div className="rounded border border-[#1f2533] bg-[#11151d] p-2.5 font-mono text-xs flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="block font-sans text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  HMAC-SHA256 Signature Digest (Verified via Constant-Time hmac.compare_digest)
                </span>
                <span className="mt-0.5 block text-emerald-400 break-all">
                  {hmac_challenge.signature}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(hmac_challenge.signature, "sig")}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-[#1f2533] hover:text-slate-200"
                title="Copy Signature"
              >
                {copiedField === "sig" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Execution Verdict Banner */}
          {approvalResult && (
            <div
              role="status"
              className={`rounded-md border p-3.5 flex items-start gap-3 ${
                approvalResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-500/30 bg-red-500/10 text-red-200"
              }`}
            >
              {approvalResult.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs space-y-1">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  <span>
                    {approvalResult.ok
                      ? "Signature Verified & PayPal Sandbox Order Captured"
                      : `Authorization Rejected (HTTP ${approvalResult.httpCode || 401})`}
                  </span>
                  <span className="rounded border border-current/20 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                    {approvalResult.hmac_status}
                  </span>
                </div>
                <p className="text-slate-200">{approvalResult.message}</p>
                {approvalResult.paypal_order_id && (
                  <p className="font-mono text-[11px] text-emerald-300">
                    PayPal Order ID: {approvalResult.paypal_order_id} • Idempotency Key:{" "}
                    {order_draft_id}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Footer Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#1f2533]">
            {/* Left: Security Threat Simulation Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {!approvalResult?.ok ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    handleCryptographicSign({
                      tamperedTotal: Number((total_usd * 10).toFixed(2)),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  title="Simulates an attacker modifying the order amount in transit after nonce generation"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Test MITM Tamper (${(total_usd * 10).toFixed(0)}.00)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleCryptographicSign()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                  title="Re-sends the exact same approval payload to verify single-use nonce replay rejection (409 Conflict)"
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Test Replay Attack (Re-send Spent Nonce)
                </button>
              )}
            </div>

            {/* Right: Primary Authorization Controls */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[#2e374a] bg-[#141821] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#1f2533] hover:text-white transition-colors"
              >
                {approvalResult?.ok ? "Done" : "Cancel"}
              </button>

              {!approvalResult?.ok && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleCryptographicSign()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#0066cc] hover:bg-[#0052a3] px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isSubmitting
                    ? "Verifying HMAC & Capturing..."
                    : isExpired
                    ? "Submit Expired Nonce (Test 401)"
                    : "Cryptographic Sign & Approve"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

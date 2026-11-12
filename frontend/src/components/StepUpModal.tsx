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
  Zap,
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

  if (!challengeData || !challengeData.hmac_challenge) return null;

  const { order_draft_id, total_usd, items, hmac_challenge } = challengeData;
  const isExpired = secondsLeft <= 0 && approvalResult?.hmac_status !== "SIGNED_VALID";
  const progressPct = Math.min(100, Math.max(0, (secondsLeft / 30) * 100));

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
            ? `Constant-time HMAC-SHA256 verified! PayPal Order ${data.paypal_order_id} captured.`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-amber-500/40 bg-[#0b1324] shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Top Countdown Progress Bar */}
        <div className="h-1.5 w-full bg-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              approvalResult?.ok
                ? "bg-emerald-500"
                : isExpired
                ? "bg-rose-500"
                : secondsLeft <= 10
                ? "bg-rose-500"
                : "bg-amber-400"
            }`}
            style={{ width: approvalResult?.ok ? "100%" : `${progressPct}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  TIER 2 STEP-UP REQUIRED ($25 – $200)
                </span>
                <span className="font-mono text-xs text-slate-400">{order_draft_id}</span>
              </div>
              <h3 className="mt-1 text-lg font-bold text-white">
                30-Second Cryptographic HMAC-SHA256 Approval Challenge
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Countdown & Total Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Authoritative Catalog Total
                </p>
                <p className="mt-1 text-2xl font-bold text-white font-mono">
                  ${total_usd.toFixed(2)} <span className="text-xs font-normal text-slate-400">USD</span>
                </p>
              </div>
              <Lock className="h-7 w-7 text-sky-400 opacity-80" />
            </div>

            <div
              className={`rounded-xl border p-4 flex items-center justify-between ${
                approvalResult?.ok
                  ? "border-emerald-500/40 bg-emerald-950/20"
                  : isExpired
                  ? "border-rose-500/40 bg-rose-950/20"
                  : secondsLeft <= 10
                  ? "border-rose-500/40 bg-rose-950/20 animate-pulse"
                  : "border-amber-500/30 bg-amber-950/15"
              }`}
            >
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-300">
                  Single-Use Nonce TTL Window
                </p>
                <p
                  className={`mt-1 text-2xl font-bold font-mono ${
                    approvalResult?.ok
                      ? "text-emerald-400"
                      : isExpired
                      ? "text-rose-400"
                      : secondsLeft <= 10
                      ? "text-rose-400"
                      : "text-amber-300"
                  }`}
                >
                  {approvalResult?.ok
                    ? "LOCKED & SPENT"
                    : isExpired
                    ? "EXPIRED (0s)"
                    : `${secondsLeft}s remaining`}
                </p>
              </div>
              <Clock
                className={`h-7 w-7 ${
                  approvalResult?.ok
                    ? "text-emerald-400"
                    : isExpired
                    ? "text-rose-400"
                    : "text-amber-400"
                }`}
              />
            </div>
          </div>

          {/* Itemized Server Breakdown */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Validated Server Catalog Line Items (PayPal Orders v2 Payload)
            </div>
            <div className="divide-y divide-slate-800/80">
              {items.map((item) => (
                <div key={item.sku} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 font-mono text-xs text-sky-300">
                      {item.sku}
                    </span>
                    <span className="font-medium text-slate-200">{item.name}</span>
                    <span className="text-xs text-slate-400">× {item.qty}</span>
                  </div>
                  <span className="font-mono font-semibold text-slate-200">
                    ${(item.unit_price * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Cryptographic Challenge Telemetry */}
          <div className="rounded-xl border border-slate-800 bg-[#070d19] p-4 space-y-2.5 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                Cryptographic Challenge Parameters (HMAC-SHA256)
              </span>
              <span>Constant-Time hmac.compare_digest()</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg bg-slate-900/90 p-2.5 border border-slate-800">
                <span className="block text-[10px] uppercase text-slate-500">
                  128-Bit Single-Use Nonce
                </span>
                <span className="text-amber-300 break-all">{hmac_challenge.nonce}</span>
              </div>
              <div className="rounded-lg bg-slate-900/90 p-2.5 border border-slate-800">
                <span className="block text-[10px] uppercase text-slate-500">
                  Signed Message Payload
                </span>
                <span className="text-slate-300 break-all">
                  {`${order_draft_id}:${total_usd.toFixed(2)}:${hmac_challenge.nonce.slice(0, 8)}...:${hmac_challenge.expires_at}`}
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-slate-900/90 p-2.5 border border-slate-800">
              <span className="block text-[10px] uppercase text-slate-500">
                HMAC-SHA256 Challenge Signature
              </span>
              <span className="text-emerald-300 break-all">{hmac_challenge.signature}</span>
            </div>
          </div>

          {/* Result Banner if Action Executed */}
          {approvalResult && (
            <div
              className={`rounded-xl border p-4 flex items-start gap-3 ${
                approvalResult.ok
                  ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                  : "border-rose-500/50 bg-rose-950/30 text-rose-200"
              }`}
            >
              {approvalResult.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <span>
                    {approvalResult.ok
                      ? "Cryptographic Signature Verified & PayPal Order Captured"
                      : `Security Rejection (${approvalResult.httpCode || 401})`}
                  </span>
                  <span className="rounded bg-black/30 px-2 py-0.5 font-mono text-xs">
                    {approvalResult.hmac_status}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90">{approvalResult.message}</p>
                {approvalResult.paypal_order_id && (
                  <p className="mt-1.5 font-mono text-xs text-emerald-300">
                    PayPal Order ID: {approvalResult.paypal_order_id} (Idempotency Header:{" "}
                    {order_draft_id})
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons & Judge Attack Simulators */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
            {/* Judge Attack Vector Buttons */}
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                  title="Simulates an attacker modifying the order amount in transit after nonce generation"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Simulate MITM Tamper (${(total_usd * 10).toFixed(0)})
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleCryptographicSign()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/25 transition disabled:opacity-50"
                  title="Re-sends the exact same approval payload to prove single-use nonce replay protection (409 Conflict)"
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Simulate Replay Attack (Re-send Spent Nonce)
                </button>
              )}
            </div>

            {/* Primary Sign & Approve Button */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                {approvalResult?.ok ? "Done" : "Close"}
              </button>

              {!approvalResult?.ok && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleCryptographicSign()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-sky-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 transition disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isSubmitting
                    ? "Verifying HMAC & Calling PayPal..."
                    : isExpired
                    ? "Test Expired Nonce (Expect 401)"
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

"use client";

import React, { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Search,
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  KeyRound,
  Filter,
} from "lucide-react";
import { AuditLogEntry, OrderLineItem } from "@/types/payguard";

interface AuditGridProps {
  logs: AuditLogEntry[];
  onSelectOrderReceipt: (entry: AuditLogEntry) => void;
}

export default function AuditGrid({ logs, onSelectOrderReceipt }: AuditGridProps) {
  const gridRef = useRef<AgGridReact<AuditLogEntry>>(null);
  const [quickFilterText, setQuickFilterText] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  const filteredLogs = useMemo(() => {
    if (tierFilter === "ALL") return logs;
    return logs.filter((row) => row.policy_tier === tierFilter);
  }, [logs, tierFilter]);

  // Financial & Security Aggregations across displayed rows
  const aggregations = useMemo(() => {
    let completedUsd = 0;
    let preventedUsd = 0;
    let blockedCount = 0;
    for (const row of filteredLogs) {
      if (row.status === "COMPLETED") {
        completedUsd += Number(row.total_usd || 0);
      } else if (row.status === "BLOCKED") {
        preventedUsd += Number(row.total_usd || 0);
        blockedCount += 1;
      }
    }
    return {
      completedUsd: completedUsd.toFixed(2),
      preventedUsd: preventedUsd.toFixed(2),
      blockedCount,
      totalRows: filteredLogs.length,
    };
  }, [filteredLogs]);

  const columnDefs = useMemo<ColDef<AuditLogEntry>[]>(
    () => [
      {
        field: "timestamp",
        headerName: "Timestamp (UTC)",
        width: 175,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const val = params.value as string;
          if (!val) return null;
          const formatted = val.replace("T", " ").replace("Z", " UTC");
          return (
            <span className="font-mono text-xs text-slate-400" title={val}>
              {formatted}
            </span>
          );
        },
      },
      {
        field: "prompt",
        headerName: "Raw User / Attacker Prompt",
        flex: 1.6,
        minWidth: 260,
        filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const entry = params.data;
          if (!entry) return null;
          return (
            <div className="flex items-center gap-2 truncate py-1" title={entry.prompt}>
              <span className="font-mono text-[10px] text-slate-500 shrink-0">
                {entry.order_draft_id}
              </span>
              <span className="truncate text-xs text-slate-200 font-medium">
                {entry.prompt}
              </span>
            </div>
          );
        },
      },
      {
        field: "parsed_skus",
        headerName: "Validated SKUs & Qty",
        width: 220,
        sortable: false,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const items = (params.value as OrderLineItem[]) || [];
          if (!items.length) {
            return (
              <span className="font-mono text-[11px] text-slate-500 italic">
                None (Short-Circuited)
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center gap-1 py-1 overflow-hidden">
              {items.map((item, idx) => (
                <span
                  key={`${item.sku}-${idx}`}
                  className="inline-flex items-center gap-1 rounded bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 font-mono text-[11px] text-sky-300"
                  title={`${item.name} ($${item.unit_price} × ${item.qty})`}
                >
                  {item.sku} <strong className="text-white">×{item.qty}</strong>
                </span>
              ))}
            </div>
          );
        },
      },
      {
        field: "total_usd",
        headerName: "Total USD",
        width: 120,
        sortable: true,
        filter: "agNumberColumnFilter",
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const val = Number(params.value || 0);
          return (
            <span className="font-mono text-xs font-bold text-white">
              ${val.toFixed(2)}
            </span>
          );
        },
      },
      {
        field: "policy_tier",
        headerName: "Policy Tier",
        width: 155,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const tier = params.value as string;
          if (tier === "TIER_1_AUTO") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                TIER_1_AUTO
              </span>
            );
          }
          if (tier === "TIER_2_STEP_UP") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                TIER_2_STEP_UP
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
              TIER_3_BLOCKED
            </span>
          );
        },
      },
      {
        field: "threat_flag",
        headerName: "Threat Flag",
        width: 165,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const flag = params.value as string;
          if (flag === "CLEAN") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
                <ShieldCheck className="h-3 w-3" /> CLEAN
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded bg-rose-950/60 border border-rose-500/50 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-300">
              <ShieldAlert className="h-3 w-3 text-rose-400" /> {flag}
            </span>
          );
        },
      },
      {
        field: "hmac_status",
        headerName: "HMAC-SHA256 Status",
        width: 165,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const hmac = params.value as string;
          if (hmac === "SIGNED_VALID") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 border border-sky-500/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                <KeyRound className="h-3 w-3" /> SIGNED_VALID
              </span>
            );
          }
          if (hmac === "PENDING") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                <Clock className="h-3 w-3" /> AWAITING_30S
              </span>
            );
          }
          if (hmac === "N/A") {
            return <span className="font-mono text-xs text-slate-500">N/A</span>;
          }
          return (
            <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-300">
              {hmac}
            </span>
          );
        },
      },
      {
        field: "paypal_order_id",
        headerName: "PayPal Sandbox Order ID",
        width: 195,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const orderId = params.value as string | null;
          const entry = params.data;
          if (!orderId || !entry) {
            return <span className="font-mono text-xs text-slate-600">—</span>;
          }
          return (
            <button
              type="button"
              onClick={() => onSelectOrderReceipt(entry)}
              className="inline-flex items-center gap-1.5 rounded bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 font-mono text-xs font-medium text-indigo-300 hover:bg-indigo-500/25 hover:text-white transition"
              title="Click to inspect full PayPal Orders v2 Receipt & Cryptographic Audit Record"
            >
              <span>{orderId}</span>
              <ExternalLink className="h-3 w-3 opacity-80" />
            </button>
          );
        },
      },
      {
        field: "status",
        headerName: "Status",
        width: 155,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const st = params.value as string;
          if (st === "COMPLETED") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> COMPLETED
              </span>
            );
          }
          if (st === "PENDING_APPROVAL") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 animate-pulse">
                <Clock className="h-3.5 w-3.5" /> AWAITING_HMAC
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
              <XCircle className="h-3.5 w-3.5" /> BLOCKED
            </span>
          );
        },
      },
    ],
    [onSelectOrderReceipt]
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
    }),
    []
  );

  const handleExportCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `payguard-security-audit-ledger-${Date.now()}.csv`,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1222] shadow-xl overflow-hidden">
      {/* Toolbar Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 px-6 py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h2 className="text-base font-bold text-white tracking-tight">
              AG Grid Live Cryptographic Security & PayPal Orders v2 Audit Ledger
            </h2>
            <span className="rounded-md bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 font-mono text-[11px] text-sky-300">
              ag-grid-react v32
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Real-time immutable stream of firewall decisions, SKU sanitizations, HMAC-SHA256 nonces,
            and PayPal Sandbox captures.
          </p>
        </div>

        {/* Filter & Export Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tier Pills */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/90 p-1 text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-400 ml-2 mr-1.5" />
            {[
              { id: "ALL", label: "All Tiers" },
              { id: "TIER_1_AUTO", label: "Tier 1 (<$25)" },
              { id: "TIER_2_STEP_UP", label: "Tier 2 (HMAC)" },
              { id: "TIER_3_BLOCKED", label: "Tier 3 (Blocked)" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTierFilter(tab.id)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  tierFilter === tab.id
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              placeholder="Filter prompts, SKUs, Order ID..."
              className="w-56 rounded-lg border border-slate-800 bg-slate-900/90 pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* AG Grid Table Container */}
      <div className="ag-theme-quartz-dark payguard-grid w-full" style={{ height: 420 }}>
        <AgGridReact<AuditLogEntry>
          ref={gridRef}
          rowData={filteredLogs}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          animateRows={true}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
        />
      </div>

      {/* Financial Aggregation Footer Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 bg-[#080e1c] px-6 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-slate-400">Ledger Records Shown: </span>
            <span className="font-mono font-bold text-white">{aggregations.totalRows}</span>
          </div>
          <div>
            <span className="text-slate-400">Verified PayPal Captures: </span>
            <span className="font-mono font-bold text-emerald-400">
              ${aggregations.completedUsd} USD
            </span>
          </div>
          <div>
            <span className="text-slate-400">Prevented Unauthorized Spend: </span>
            <span className="font-mono font-bold text-rose-400">
              ${aggregations.preventedUsd} USD ({aggregations.blockedCount} blocked events)
            </span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          Zero-Trust Policy Engine • Constant-Time HMAC-SHA256 • PayPal Orders v2
        </div>
      </div>
    </div>
  );
}

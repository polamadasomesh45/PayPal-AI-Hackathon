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
  X,
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

  const tierCounts = useMemo(() => {
    const counts = {
      ALL: logs.length,
      TIER_1_AUTO: 0,
      TIER_2_STEP_UP: 0,
      TIER_3_BLOCKED: 0,
    };
    for (const row of logs) {
      if (row.policy_tier in counts) {
        counts[row.policy_tier as keyof typeof counts] += 1;
      }
    }
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (tierFilter === "ALL") return logs;
    return logs.filter((row) => row.policy_tier === tierFilter);
  }, [logs, tierFilter]);

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
        width: 170,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const val = params.value as string;
          if (!val) return null;
          const formatted = val.replace("T", " ").replace("Z", "");
          return (
            <span className="font-mono text-xs text-slate-400 tabular-nums" title={val}>
              {formatted}
            </span>
          );
        },
      },
      {
        field: "prompt",
        headerName: "User / Agent Input & Draft ID",
        flex: 1.6,
        minWidth: 260,
        filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const entry = params.data;
          if (!entry) return null;
          return (
            <div className="flex items-center gap-2.5 truncate py-1" title={entry.prompt}>
              <span className="rounded border border-[#262f40] bg-[#141821] px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400 shrink-0 tabular-nums">
                {entry.order_draft_id}
              </span>
              <span className="truncate text-xs text-slate-200">{entry.prompt}</span>
            </div>
          );
        },
      },
      {
        field: "parsed_skus",
        headerName: "Validated SKUs",
        width: 215,
        sortable: false,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const items = (params.value as OrderLineItem[]) || [];
          if (!items.length) {
            return (
              <span className="font-mono text-[11px] text-slate-500">
                — (Short-Circuited)
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center gap-1 py-1 overflow-hidden">
              {items.map((item, idx) => (
                <span
                  key={`${item.sku}-${idx}`}
                  className="inline-flex items-center gap-1 rounded border border-[#262f40] bg-[#141821] px-1.5 py-0.5 font-mono text-[11px] text-slate-200 tabular-nums"
                  title={`${item.name} ($${item.unit_price} × ${item.qty})`}
                >
                  <span className="text-sky-400">{item.sku}</span>
                  <span className="text-slate-400">×{item.qty}</span>
                </span>
              ))}
            </div>
          );
        },
      },
      {
        field: "total_usd",
        headerName: "Amount (USD)",
        width: 125,
        sortable: true,
        filter: "agNumberColumnFilter",
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const val = Number(params.value || 0);
          return (
            <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
              ${val.toFixed(2)}
            </span>
          );
        },
      },
      {
        field: "policy_tier",
        headerName: "Policy Tier",
        width: 150,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const tier = params.value as string;
          if (tier === "TIER_1_AUTO") {
            return (
              <span className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-300">
                TIER_1_AUTO
              </span>
            );
          }
          if (tier === "TIER_2_STEP_UP") {
            return (
              <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-amber-300">
                TIER_2_STEP_UP
              </span>
            );
          }
          return (
            <span className="inline-flex items-center rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-red-300">
              TIER_3_BLOCKED
            </span>
          );
        },
      },
      {
        field: "threat_flag",
        headerName: "Threat Classification",
        width: 165,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const flag = params.value as string;
          if (flag === "CLEAN") {
            return (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" /> CLEAN
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-red-300">
              <ShieldAlert className="h-3 w-3 text-red-400" /> {flag}
            </span>
          );
        },
      },
      {
        field: "hmac_status",
        headerName: "HMAC-SHA256 State",
        width: 160,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const hmac = params.value as string;
          if (hmac === "SIGNED_VALID") {
            return (
              <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-sky-300">
                <KeyRound className="h-3 w-3" /> SIGNED_VALID
              </span>
            );
          }
          if (hmac === "PENDING") {
            return (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10.5px] text-amber-300">
                <Clock className="h-3 w-3" /> PENDING_30S
              </span>
            );
          }
          if (hmac === "N/A") {
            return <span className="font-mono text-xs text-slate-500">N/A</span>;
          }
          return (
            <span className="inline-flex items-center rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-red-300">
              {hmac}
            </span>
          );
        },
      },
      {
        field: "paypal_order_id",
        headerName: "PayPal Order ID",
        width: 190,
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
              className="inline-flex items-center gap-1.5 rounded border border-[#262f40] bg-[#141821] px-2 py-0.5 font-mono text-xs text-sky-300 hover:border-sky-500/40 hover:bg-[#1a202c] hover:text-white transition-colors tabular-nums"
              title="Inspect PayPal Orders v2 Settlement Receipt"
            >
              <span>{orderId}</span>
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </button>
          );
        },
      },
      {
        field: "status",
        headerName: "Settlement Status",
        width: 155,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const st = params.value as string;
          if (st === "COMPLETED") {
            return (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> COMPLETED
              </span>
            );
          }
          if (st === "PENDING_APPROVAL") {
            return (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-amber-300">
                <Clock className="h-3 w-3" /> AWAITING_HMAC
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-red-300">
              <XCircle className="h-3 w-3" /> BLOCKED
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
      fileName: `payguard-audit-ledger-${Date.now()}.csv`,
    });
  };

  return (
    <div className="rounded-lg border border-[#1f2533] bg-[#0f1219] overflow-hidden">
      {/* Ledger Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#1f2533] bg-[#141821] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Cryptographic Security &amp; PayPal Settlement Audit Ledger
          </h2>
          <span className="rounded border border-[#262f40] bg-[#0f1219] px-2 py-0.5 font-mono text-[10.5px] text-slate-400">
            AG Grid Enterprise View
          </span>
        </div>

        {/* Filter & Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Tier Filter */}
          <div
            className="inline-flex items-center rounded-md border border-[#1f2533] bg-[#090b10] p-0.5 text-xs"
            role="group"
            aria-label="Filter ledger by policy tier"
          >
            {[
              { id: "ALL", label: "All", count: tierCounts.ALL },
              { id: "TIER_1_AUTO", label: "Tier 1", count: tierCounts.TIER_1_AUTO },
              { id: "TIER_2_STEP_UP", label: "Tier 2", count: tierCounts.TIER_2_STEP_UP },
              { id: "TIER_3_BLOCKED", label: "Tier 3", count: tierCounts.TIER_3_BLOCKED },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTierFilter(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  tierFilter === tab.id
                    ? "bg-[#1a202c] text-white border border-[#2e374a]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search audit ledger"
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              placeholder="Search prompt, SKU, Order ID..."
              className="w-56 rounded-md border border-[#1f2533] bg-[#090b10] pl-8 pr-7 py-1 text-xs text-slate-100 placeholder-slate-500 focus:border-[#0066cc] focus:outline-none"
            />
            {quickFilterText && (
              <button
                type="button"
                aria-label="Clear search filter"
                onClick={() => setQuickFilterText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#262f40] bg-[#0f1219] px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-[#1a202c] hover:text-white transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* AG Grid Table */}
      <div className="ag-theme-quartz-dark payguard-grid w-full" style={{ height: 400 }}>
        <AgGridReact<AuditLogEntry>
          ref={gridRef}
          rowData={filteredLogs}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          animateRows={false}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
        />
      </div>

      {/* Reconciliation Summary Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#1f2533] bg-[#0c0f15] px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Records Displayed:</span>
            <span className="font-mono font-semibold text-slate-200 tabular-nums">
              {aggregations.totalRows}
            </span>
          </div>
          <span className="text-[#1f2533]" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Settled PayPal Volume:</span>
            <span className="font-mono font-semibold text-emerald-400 tabular-nums">
              ${aggregations.completedUsd} USD
            </span>
          </div>
          <span className="text-[#1f2533]" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Blocked / Prevented Exposure:</span>
            <span className="font-mono font-semibold text-red-400 tabular-nums">
              ${aggregations.preventedUsd} USD ({aggregations.blockedCount} blocked)
            </span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          SQLite WAL Ledger • PayPal-Request-Id Idempotency Enforced
        </div>
      </div>
    </div>
  );
}

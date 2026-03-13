"use client";

import { useState } from "react";
import type { CanonicalParse, StateDecision } from "@/lib/types";

interface DebugInfo {
  canonical?: CanonicalParse;
  state_decision?: StateDecision & {
    partial_refuse?: {
      refused_flags: Array<{ flag: string; source_text: string }>;
      forbidden_topics: string[];
    };
  };
  guard_result?: {
    decision: string;
    reason_codes: string[];
  };
}

interface Props {
  debug?: DebugInfo;
}

const STATE_COLORS: Record<string, string> = {
  S_RECOMMEND: "bg-green-100 text-green-800",
  S_CLARIFY: "bg-yellow-100 text-yellow-800",
  S_ANSWER: "bg-blue-100 text-blue-800",
  S_REFUSE: "bg-red-100 text-red-800",
};

const GUARD_COLORS: Record<string, string> = {
  ALLOW: "bg-green-100 text-green-800",
  BLOCK: "bg-red-100 text-red-800",
  REWRITE: "bg-orange-100 text-orange-800",
};

export function DebugPanel({ debug }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!debug) return null;

  const state = debug.state_decision?.state || "unknown";
  const stateColor = STATE_COLORS[state] || "bg-gray-100 text-gray-800";
  const guardDecision = debug.guard_result?.decision || "N/A";
  const guardColor = GUARD_COLORS[guardDecision] || "bg-gray-100 text-gray-800";

  return (
    <div className="mt-1 ml-12">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${stateColor}`}>
          {state}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${guardColor}`}>
          Guard: {guardDecision}
        </span>
        {debug.state_decision?.reasons && debug.state_decision.reasons.length > 0 && (
          <span className="text-[10px] text-gray-400 font-mono">
            {debug.state_decision.reasons[0]}
          </span>
        )}
        <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs font-mono space-y-3">
          {debug.canonical && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">M1 Parse (Canonical)</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <span className="text-gray-400">intent:</span>{" "}
                  <span className="text-indigo-600">{debug.canonical.intent}</span>
                </div>
                <div>
                  <span className="text-gray-400">need_clarify:</span>{" "}
                  <span className={debug.canonical.need_clarify ? "text-yellow-600" : "text-green-600"}>
                    {String(debug.canonical.need_clarify)}
                  </span>
                </div>
              </div>
              {debug.canonical.entities && Object.keys(debug.canonical.entities).length > 0 && (
                <div className="mt-1">
                  <span className="text-gray-400">entities: </span>
                  {Object.entries(debug.canonical.entities)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => (
                      <span key={k} className="inline-block bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded mr-1 mt-0.5">
                        {k}={typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    ))}
                </div>
              )}
              {/* Risk Flags (OPT-1: object format with source_text) */}
              {debug.canonical.risk_flags && debug.canonical.risk_flags.length > 0 && (
                <div className="mt-1">
                  <span className="text-gray-400">risk_flags: </span>
                  {debug.canonical.risk_flags.map((rf: { flag?: string; source_text?: string } | string, i: number) => {
                    const flag = typeof rf === "string" ? rf : rf.flag;
                    const source = typeof rf === "string" ? "" : rf.source_text;
                    return (
                      <span key={i} className="inline-block bg-red-50 text-red-700 px-1.5 py-0.5 rounded mr-1 mt-0.5">
                        {flag}{source ? ` → "${source}"` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
              {debug.canonical.missing_slots && debug.canonical.missing_slots.length > 0 && (
                <div className="mt-1">
                  <span className="text-gray-400">missing: </span>
                  {debug.canonical.missing_slots.map((s) => (
                    <span key={s} className="inline-block bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded mr-1">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {debug.state_decision && (
            <div className="border-t border-gray-200 pt-2">
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">M2 Policy Decision</div>
              <div>
                <span className="text-gray-400">state:</span>{" "}
                <span className={`px-1.5 py-0.5 rounded font-semibold ${stateColor}`}>
                  {debug.state_decision.state}
                </span>
              </div>
              <div className="mt-1">
                <span className="text-gray-400">rules matched: </span>
                <span className="text-gray-600">{debug.state_decision.reasons.join(" → ")}</span>
              </div>
              <div className="mt-1">
                <span className="text-gray-400">allowed: </span>
                <span className="text-green-600">{debug.state_decision.allowed_actions.join(", ")}</span>
              </div>
              <div className="mt-1">
                <span className="text-gray-400">forbidden: </span>
                <span className="text-red-600">{debug.state_decision.forbidden.join(", ")}</span>
              </div>
              {/* OPT-1: 部分拒绝详情 */}
              {debug.state_decision.partial_refuse && (
                <div className="mt-1">
                  <span className="text-gray-400">partial_refuse: </span>
                  {debug.state_decision.partial_refuse.refused_flags?.map((rf: { flag: string; source_text: string }, i: number) => (
                    <span key={i} className="inline-block bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded mr-1">
                      {rf.flag}{rf.source_text ? ` → "${rf.source_text}"` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {debug.guard_result && (
            <div className="border-t border-gray-200 pt-2">
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Output Guard</div>
              <div>
                <span className="text-gray-400">decision:</span>{" "}
                <span className={`px-1.5 py-0.5 rounded font-semibold ${guardColor}`}>
                  {debug.guard_result.decision}
                </span>
              </div>
              {debug.guard_result.reason_codes.length > 0 && (
                <div className="mt-1">
                  <span className="text-gray-400">violations: </span>
                  {debug.guard_result.reason_codes.map((c) => (
                    <span key={c} className="inline-block bg-red-50 text-red-700 px-1.5 py-0.5 rounded mr-1">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

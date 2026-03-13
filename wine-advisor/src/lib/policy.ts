// ============================================
// M2 - 规则引擎（Policy & State Engine）
// ============================================
// 职责：系统的最终裁判者
// 纯确定性逻辑，不依赖 LLM，不依赖模型置信度
// 规则优先级：拒绝(1000) > 部分拒绝(900) > 澄清(500) > 信息(200) > 推荐(100)
// ============================================

import type { CanonicalParse, StateDecision, SystemState, RiskFlagDetail, RiskFlag } from "@/lib/types";

// ============================================
// 辅助函数
// ============================================

/** 检查是否存在某个 risk flag（兼容新旧格式） */
function hasRiskFlag(c: CanonicalParse, flag: string): boolean {
  return c.risk_flags.some((rf) =>
    typeof rf === "string" ? rf === flag : rf.flag === flag
  );
}

/** 获取指定 flag 的详情（OPT-1） */
function getRiskFlagDetails(c: CanonicalParse, flag: string): RiskFlagDetail[] {
  return c.risk_flags
    .filter((rf) => (typeof rf === "string" ? rf === flag : rf.flag === flag))
    .map((rf) => (typeof rf === "string" ? { flag: rf as RiskFlag, source_text: "" } : rf));
}

/** 高风险 flag 列表 */
const HIGH_RISK_FLAGS = ["external_comparison", "encourage_drinking", "minor_related", "health_claim"];

/** 检查是否存在任何高风险 flag */
function hasHighRiskFlag(c: CanonicalParse): boolean {
  return c.risk_flags.some((rf) => {
    const flag = typeof rf === "string" ? rf : rf.flag;
    return HIGH_RISK_FLAGS.includes(flag);
  });
}

/** 获取所有高风险 flag 详情 */
function getHighRiskFlags(c: CanonicalParse): RiskFlagDetail[] {
  return c.risk_flags
    .filter((rf) => {
      const flag = typeof rf === "string" ? rf : rf.flag;
      return HIGH_RISK_FLAGS.includes(flag);
    })
    .map((rf) => (typeof rf === "string" ? { flag: rf as RiskFlag, source_text: "" } : rf));
}

/** 计算有效 entity 数量（非 null） */
function countValidEntities(c: CanonicalParse): number {
  if (!c.entities) return 0;
  return Object.values(c.entities).filter((v) => v != null).length;
}

/** 根据 risk flag 类型生成禁止讨论的主题描述 */
function flagToForbiddenTopic(flag: string): string {
  switch (flag) {
    case "health_claim": return "health benefits or medical effects of wine";
    case "encourage_drinking": return "encouraging alcohol consumption";
    case "external_comparison": return "competitor brands or non-catalog wines";
    default: return flag;
  }
}

// Suppress unused variable warnings - these are used in evaluatePolicy
void getRiskFlagDetails;

// ============================================
// 规则定义
// ============================================

interface PolicyRule {
  name: string;
  priority: number;
  condition: (canonical: CanonicalParse, historyStates: SystemState[]) => boolean;
  action: {
    state: SystemState;
    reason_code: string;
    allowed_actions: string[];
    forbidden: string[];
  };
}

const POLICY_RULES: PolicyRule[] = [
  // ======================================
  // 拒绝类规则 (Priority 1000+)
  // ======================================
  {
    name: "RULE_REFUSE_OUT_OF_SCOPE",
    priority: 1100,
    condition: (c) => c.intent === "out_of_scope",
    action: {
      state: "S_REFUSE",
      reason_code: "OUT_OF_SCOPE",
      allowed_actions: ["explain_boundary", "suggest_alternative"],
      forbidden: ["recommend_wine", "output_wine_name", "output_sku"],
    },
  },
  {
    name: "RULE_REFUSE_EXTERNAL_COMPARISON",
    priority: 1050,
    condition: (c) => hasRiskFlag(c, "external_comparison"),
    action: {
      state: "S_REFUSE",
      reason_code: "EXTERNAL_COMPARISON",
      allowed_actions: ["explain_boundary", "suggest_alternative"],
      forbidden: ["recommend_wine", "compare_external"],
    },
  },
  {
    name: "RULE_REFUSE_ENCOURAGE_DRINKING",
    priority: 1040,
    condition: (c) => hasRiskFlag(c, "encourage_drinking"),
    action: {
      state: "S_REFUSE",
      reason_code: "ENCOURAGE_DRINKING",
      allowed_actions: ["explain_boundary"],
      forbidden: ["recommend_wine", "encourage_consumption"],
    },
  },
  {
    name: "RULE_REFUSE_MINOR_RELATED",
    priority: 1030,
    condition: (c) => hasRiskFlag(c, "minor_related"),
    action: {
      state: "S_REFUSE",
      reason_code: "MINOR_RELATED",
      allowed_actions: ["explain_boundary"],
      forbidden: ["recommend_wine", "any_wine_content"],
    },
  },
  {
    name: "RULE_REFUSE_HEALTH_CLAIM",
    priority: 1020,
    // OPT-1: 仅当用户意图不是推荐或没有有效 entities 时，才完全拒绝
    // 如果有合法推荐意图 + 健康风险 → 交给部分拒绝规则处理
    condition: (c) => {
      if (!hasRiskFlag(c, "health_claim")) return false;
      // 如果意图是推荐且有至少 1 个有效 entity → 让部分拒绝规则处理
      if (c.intent === "recommend_wine" && countValidEntities(c) >= 1) return false;
      return true;
    },
    action: {
      state: "S_REFUSE",
      reason_code: "HEALTH_CLAIM",
      allowed_actions: ["explain_boundary", "suggest_alternative"],
      forbidden: ["health_advice", "medical_claim"],
    },
  },
  {
    name: "RULE_REFUSE_CLARIFY_DEADLOCK",
    priority: 1000,
    condition: (_c, history) => {
      if (history.length < 3) return false;
      const last3 = history.slice(-3);
      return last3.every((s) => s === "S_CLARIFY");
    },
    action: {
      state: "S_REFUSE",
      reason_code: "CLARIFY_DEADLOCK",
      allowed_actions: ["explain_boundary", "suggest_human_contact"],
      forbidden: ["recommend_wine", "ask_clarification"],
    },
  },

  // ======================================
  // OPT-1: 部分拒绝规则 (Priority 900+)
  // 当风险 flag 存在但用户也有合法推荐意图时
  // ======================================
  {
    name: "RULE_PARTIAL_REFUSE_RECOMMEND",
    priority: 950,
    condition: (c) => {
      // 必须同时满足: 有高风险 flag + 推荐意图 + 至少1个有效entity
      if (c.intent !== "recommend_wine") return false;
      if (!hasHighRiskFlag(c)) return false;
      if (countValidEntities(c) < 1) return false;
      // 排除绝对不可部分处理的: 未成年人、鼓励饮酒
      if (hasRiskFlag(c, "minor_related")) return false;
      if (hasRiskFlag(c, "encourage_drinking")) return false;
      return true;
    },
    action: {
      state: "S_RECOMMEND",
      reason_code: "PARTIAL_REFUSE",
      allowed_actions: ["recommend_wine", "output_candidates", "explain_reasoning", "output_sku"],
      forbidden: ["health_advice", "medical_claim", "compare_external"],
    },
  },

  // ======================================
  // 澄清类规则 (Priority 500+)
  // ======================================
  {
    name: "RULE_CLARIFY_HIGH_CONFLICT",
    priority: 550,
    condition: (c) => {
      if (!c.conflicts || c.conflicts.length === 0) return false;
      return c.conflicts.some((conflict) => conflict.severity >= 0.6);
    },
    action: {
      state: "S_CLARIFY",
      reason_code: "HIGH_CONFLICT",
      allowed_actions: ["confirm_understanding", "ask_clarification", "explain_direction"],
      forbidden: ["recommend_wine", "output_sku", "ranking"],
    },
  },
  {
    name: "RULE_CLARIFY_MISSING_SLOTS",
    priority: 530,
    condition: (c) => {
      if (c.intent !== "recommend_wine") return false;
      return (c.missing_slots?.length ?? 0) >= 2;
    },
    action: {
      state: "S_CLARIFY",
      reason_code: "MISSING_SLOTS",
      allowed_actions: ["confirm_understanding", "ask_clarification", "explain_direction"],
      forbidden: ["recommend_wine", "output_sku", "ranking"],
    },
  },
  {
    name: "RULE_CLARIFY_NEED_CLARIFY_FLAG",
    priority: 510,
    condition: (c) => {
      if (c.intent !== "recommend_wine") return false;
      return c.need_clarify === true;
    },
    action: {
      state: "S_CLARIFY",
      reason_code: "NEED_CLARIFY",
      allowed_actions: ["confirm_understanding", "ask_clarification", "explain_direction"],
      forbidden: ["recommend_wine", "output_sku", "ranking"],
    },
  },

  // ======================================
  // 信息类规则 (Priority 200+)
  // ======================================
  {
    name: "RULE_ANSWER_ASK_INFO",
    priority: 200,
    condition: (c) => {
      if (c.intent !== "ask_info") return false;
      // 确保没有高风险标记
      return !hasHighRiskFlag(c);
    },
    action: {
      state: "S_ANSWER",
      reason_code: "INFO_REQUEST",
      allowed_actions: ["explain_knowledge", "describe_wine_characteristics", "explain_region"],
      forbidden: ["recommend_specific_wine", "output_sku", "ranking"],
    },
  },

  // ======================================
  // 推荐类规则 (Priority 100+)
  // ======================================
  {
    name: "RULE_RECOMMEND_CLEAR_INTENT",
    priority: 100,
    condition: (c) => {
      if (c.intent !== "recommend_wine") return false;
      if ((c.missing_slots?.length ?? 0) >= 2) return false;
      if (c.conflicts?.some((conflict) => conflict.severity >= 0.6)) return false;
      // 确保没有高风险标记
      if (hasHighRiskFlag(c)) return false;
      return true;
    },
    action: {
      state: "S_RECOMMEND",
      reason_code: "CLEAR_RECOMMENDATION_INTENT",
      allowed_actions: ["recommend_wine", "output_candidates", "explain_reasoning", "compare_candidates", "output_sku"],
      forbidden: ["absolute_ranking", "guarantee_satisfaction"],
    },
  },
];

// ============================================
// 规则引擎执行器
// ============================================

/**
 * M2: 执行规则引擎，返回状态裁决
 */
export function evaluatePolicy(
  canonical: CanonicalParse,
  historyStates: SystemState[] = []
): StateDecision {
  // 按优先级降序排序
  const sortedRules = [...POLICY_RULES].sort((a, b) => b.priority - a.priority);

  // 收集所有匹配的规则（用于审计）
  const matchedRules: string[] = [];
  let winningRule: PolicyRule | null = null;

  for (const rule of sortedRules) {
    try {
      if (rule.condition(canonical, historyStates)) {
        matchedRules.push(rule.name);
        if (!winningRule) {
          winningRule = rule; // 第一个匹配的就是最高优先级
        }
      }
    } catch (error) {
      console.error(`Rule evaluation error [${rule.name}]:`, error);
    }
  }

  // 无匹配规则 → 保守 Fallback
  if (!winningRule) {
    console.warn("No rule matched — falling back to S_REFUSE");
    return {
      state: "S_REFUSE",
      reasons: ["NO_RULE_MATCHED"],
      allowed_actions: ["explain_boundary", "suggest_alternative"],
      forbidden: ["recommend_wine", "output_sku"],
      required_slots_missing: canonical.missing_slots,
      conflict_summary: undefined,
    };
  }

  // 构建状态裁决
  const decision: StateDecision = {
    state: winningRule.action.state,
    reasons: matchedRules,
    allowed_actions: winningRule.action.allowed_actions,
    forbidden: winningRule.action.forbidden,
  };

  // 补充澄清信息
  if (decision.state === "S_CLARIFY") {
    decision.required_slots_missing = canonical.missing_slots;
    if (canonical.conflicts && canonical.conflicts.length > 0) {
      decision.conflict_summary = canonical.conflicts
        .map((c) => c.description)
        .join("; ");
    }
  }

  // OPT-1: 补充部分拒绝信息
  if (winningRule.name === "RULE_PARTIAL_REFUSE_RECOMMEND") {
    const riskyFlags = getHighRiskFlags(canonical);
    decision.partial_refuse = {
      refused_flags: riskyFlags,
      forbidden_topics: riskyFlags.map((rf) => flagToForbiddenTopic(rf.flag)),
    };
  }

  return decision;
}

/**
 * 检查状态转换是否合法
 */
export function isValidTransition(
  from: SystemState | null,
  to: SystemState
): boolean {
  // 从初始状态可以去任何地方
  if (from === null) return true;

  // S_REFUSE → S_RECOMMEND 禁止直接转换
  if (from === "S_REFUSE" && to === "S_RECOMMEND") return false;

  return true;
}

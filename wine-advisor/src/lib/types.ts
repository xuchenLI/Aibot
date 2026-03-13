// ============================================
// Wine Advisor - 核心类型定义
// ============================================

/** 系统状态（状态机的 4 个状态） */
export type SystemState = "S_ANSWER" | "S_CLARIFY" | "S_RECOMMEND" | "S_REFUSE";

/** 用户意图 */
export type UserIntent = "ask_info" | "recommend_wine" | "out_of_scope";

/** 风险标记类型 */
export type RiskFlag =
  | "external_comparison"
  | "purchase_intent"
  | "encourage_drinking"
  | "minor_related"
  | "health_claim"
  | "out_of_scope";

/** 风险标记详情（OPT-1: 含 Evidence Snippets） */
export interface RiskFlagDetail {
  flag: RiskFlag;
  /** 触发该风险的用户原文片段 */
  source_text: string;
}

/** 酒款目录分组：按红/白再按葡萄品种 */
export interface CatalogGroupedSection {
  variety: string;
  wines: WineCandidate[];
}
export interface CatalogGrouped {
  red: CatalogGroupedSection[];
  white: CatalogGroupedSection[];
  rose?: CatalogGroupedSection[];
  sparkling?: CatalogGroupedSection[];
}

/** 酒庄展示（快速查询「我们代理的酒庄」/ 酒庄介绍 / 酒庄卖点） */
export interface WineryDisplay {
  id: string;
  name_zh: string;
  name_en: string;
  intro_zh?: string;
  intro_en?: string;
  selling_points_zh?: string;
  selling_points_en?: string;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  /** 如果是推荐状态，附带候选酒信息 */
  wines?: WineCandidate[];
  /** 酒款目录按红白+品种分组展示（仅「你们有哪些酒」） */
  catalog_grouped?: CatalogGrouped;
  /** 酒庄列表（我们代理的酒庄 / 酒庄介绍 / 酒庄卖点） */
  wineries?: WineryDisplay[];
  /** Fast Path 可选问题 */
  quick_questions?: QuickQuestion[];
  /** 系统状态（仅内部使用，用于调试） */
  _state?: SystemState;
  /** 调试信息 */
  _debug?: {
    canonical?: CanonicalParse;
    state_decision?: StateDecision;
    guard_result?: GuardResult;
  };
}

/** 葡萄酒候选 */
export interface WineCandidate {
  id: string;
  name: string;
  name_cn?: string;
  sku: string;
  color: string;
  region: string;
  grape_variety: string;
  tasting_notes: string;
  price: number;
  video_url?: string;
  video_title?: string;
  /** 匹配得分（内部使用） */
  _score?: number;
}

/** Fast Path 引导问题 */
export interface QuickQuestion {
  id: string;
  text: string;
}

/** M1 语义解析输出 - Canonical JSON */
export interface CanonicalParse {
  intent: UserIntent;
  entities: {
    color?: "red" | "white" | "rose" | "sparkling" | null;
    acid?: "high" | "low" | "moderate" | null;
    tannin?: "strong" | "medium" | "soft" | null;
    body?: "full" | "medium" | "light" | null;
    sweetness?: "dry" | "off-dry" | "sweet" | null;
    occasion?: string | null;
    food_pairing?: string | null;
    price_range?: { min?: number; max?: number } | null;
    grape_variety?: string | null;
    region?: string | null;
    flavor_profile?: string | null;
  };
  /** OPT-1: risk_flags 改为对象数组，含 source_text 证据片段 */
  risk_flags: RiskFlagDetail[];
  need_clarify: boolean;
  missing_slots: string[];
  conflicts: Array<{
    pair: [string, string];
    description: string;
    severity: number;
  }>;
}

/** M2 状态裁决输出 */
export interface StateDecision {
  state: SystemState;
  reasons: string[];
  allowed_actions: string[];
  forbidden: string[];
  required_slots_missing?: string[];
  conflict_summary?: string;
  /** OPT-1: 部分拒绝时，记录被拒绝的风险及其原文 */
  partial_refuse?: {
    refused_flags: RiskFlagDetail[];
    /** 生成 Prompt 时告知 LLM 不可讨论的主题 */
    forbidden_topics: string[];
  };
}

/** Output Guard 结果 */
export interface GuardResult {
  decision: "ALLOW" | "BLOCK" | "REWRITE";
  reason_codes: string[];
  final_text: string;
}

/** 会话上下文 */
export interface SessionContext {
  session_id: string;
  messages: ChatMessage[];
  history_states: SystemState[];
  profile: Record<string, unknown>;
}

/** API 请求体 */
export interface ChatRequest {
  message: string;
  session_id?: string;
}

/** API 响应体 */
export interface ChatResponse {
  message: string;
  session_id: string;
  wines?: WineCandidate[];
  /** 酒款目录按红白+品种分组（快速查询「你们有哪些酒」） */
  catalog_grouped?: CatalogGrouped;
  /** 酒庄列表（快速查询酒庄相关） */
  wineries?: WineryDisplay[];
  quick_questions?: QuickQuestion[];
  /** 调试信息（仅开发模式） */
  _debug?: {
    canonical?: CanonicalParse;
    state_decision?: StateDecision;
    guard_result?: GuardResult;
  };
}

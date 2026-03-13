// ============================================
// M1 - 语义解析模块（Parse & Classify）
// ============================================
// 职责：仅负责"读懂用户在说什么"
// 输出结构化 JSON，不做是否允许输出的决策
// ============================================

import { generateJSON } from "@/lib/llm";
import type { CanonicalParse, RiskFlagDetail } from "@/lib/types";

const M1_SYSTEM_PROMPT = `You are a structured data extraction engine for a wine advisor system. Your ONLY job is to analyze the user's message and extract structured information. You do NOT generate responses to the user.

You must output a JSON object with exactly these fields:

{
  "intent": "ask_info" | "recommend_wine" | "out_of_scope",
  "entities": {
    "color": "red" | "white" | "rose" | "sparkling" | null,
    "acid": "high" | "moderate" | "low" | null,
    "tannin": "strong" | "medium" | "soft" | null,
    "body": "full" | "medium" | "light" | null,
    "sweetness": "dry" | "off-dry" | "sweet" | null,
    "occasion": string or null,
    "food_pairing": string or null,
    "price_range": { "min": number, "max": number } or null,
    "grape_variety": string or null,
    "region": string or null,
    "flavor_profile": string or null
  },
  "risk_flags": [],  // Array of {"flag": "...", "source_text": "..."} objects
  "need_clarify": true | false,
  "missing_slots": [],
  "conflicts": []
}

## Intent classification rules:
- "recommend_wine": User wants wine recommendations, wants to find/choose/buy wine, asks what wines are available
- "ask_info": User asks about wine knowledge (what is tannin, regions, grape varieties, winemaking) without asking for a specific recommendation
- "out_of_scope": User asks about topics completely unrelated to wine (weather, politics, sports, personal advice, etc.)

## Entity extraction rules:
- Only extract entities the user EXPLICITLY mentions or strongly implies
- Set to null if not mentioned
- For price_range, use numbers only (e.g., {"min": 20, "max": 40}). If user says "under $30", use {"min": 0, "max": 30}
- For occasion, use short descriptive text: "dinner party", "casual", "gift", "BBQ", "business", etc.
- For food_pairing, extract the food: "steak", "seafood", "chicken", "cheese", etc.
- For flavor_profile, extract descriptors: "fruity", "smooth", "bold", "spicy", etc.

## Risk flags (array of OBJECTS, each with "flag" and "source_text"):
Each risk flag must include the original text snippet that triggered it.
Format: {"flag": "risk_type", "source_text": "the exact words from user input that triggered this flag"}

Possible flag values:
- "external_comparison": User asks to compare with non-catalog wines or competitor brands
- "encourage_drinking": User seems to want encouragement to drink more
- "minor_related": Message involves or targets minors / underage
- "health_claim": User asks about health benefits of wine
- "purchase_intent": User asks about buying/ordering/pricing (this is OK for B2B, set flag but low risk)
- "out_of_scope": Content completely outside wine domain

Example: If user says "送老人用的，对健康好的", risk_flags should be:
[{"flag": "health_claim", "source_text": "对健康好的"}]
NOT the entire message, only the part that triggers the risk.

## need_clarify rules:
- true if intent is "recommend_wine" but less than 2 meaningful entities extracted
- true if there are conflicts between entities
- false if intent is "ask_info" or "out_of_scope"
- false if user provided enough info for a reasonable recommendation

## missing_slots rules:
- For "recommend_wine" intent, list which of these key slots are missing: "color", "body", "occasion_or_food"
- Only list truly important missing slots, not everything

## conflicts rules:
- If user says contradictory things, add to conflicts array
- Each conflict: {"pair": ["entity1", "entity2"], "description": "why they conflict", "severity": 0.0-1.0}
- Example: asking for "light body" + "strong tannin" = conflict (severity 0.7)

IMPORTANT: Output ONLY the JSON object. No explanation, no markdown, no commentary.`;

/**
 * M1: 解析用户输入为结构化 JSON
 */
export async function parseUserMessage(
  userMessage: string,
  sessionContext?: string
): Promise<CanonicalParse> {
  const prompt = sessionContext
    ? `Session context (previous preferences): ${sessionContext}\n\nCurrent user message: "${userMessage}"`
    : `User message: "${userMessage}"`;

  try {
    const parsed = await generateJSON<CanonicalParse>(prompt, M1_SYSTEM_PROMPT);

    // 基础校验与修正
    return validateAndNormalize(parsed);
  } catch (error) {
    console.error("M1 parse error:", error);
    // 解析失败 → 保守路径
    return getFallbackParse(userMessage);
  }
}

/**
 * 校验并标准化 M1 输出
 */
function validateAndNormalize(parsed: CanonicalParse): CanonicalParse {
  // 确保 intent 合法
  const validIntents = ["ask_info", "recommend_wine", "out_of_scope"];
  if (!validIntents.includes(parsed.intent)) {
    parsed.intent = "out_of_scope";
  }

  // 确保 entities 存在
  if (!parsed.entities) {
    parsed.entities = {};
  }

  // 确保数组字段存在
  if (!Array.isArray(parsed.risk_flags)) parsed.risk_flags = [];
  // OPT-1: 兼容旧格式（string[]）→ 转换为新格式（RiskFlagDetail[]）
  parsed.risk_flags = parsed.risk_flags.map((rf: unknown) => {
    if (typeof rf === "string") {
      return { flag: rf, source_text: "" } as RiskFlagDetail;
    }
    if (typeof rf === "object" && rf !== null && "flag" in rf) {
      return rf as RiskFlagDetail;
    }
    return { flag: String(rf), source_text: "" } as RiskFlagDetail;
  });
  if (!Array.isArray(parsed.missing_slots)) parsed.missing_slots = [];
  if (!Array.isArray(parsed.conflicts)) parsed.conflicts = [];

  // 确保 need_clarify 是 boolean
  if (typeof parsed.need_clarify !== "boolean") {
    parsed.need_clarify = false;
  }

  // 校验 entity 枚举值
  const validColors = ["red", "white", "rose", "sparkling", null];
  if (!validColors.includes(parsed.entities.color ?? null)) {
    parsed.entities.color = null;
  }

  const validAcid = ["high", "moderate", "low", null];
  if (!validAcid.includes(parsed.entities.acid ?? null)) {
    parsed.entities.acid = null;
  }

  const validTannin = ["strong", "medium", "soft", null];
  if (!validTannin.includes(parsed.entities.tannin ?? null)) {
    parsed.entities.tannin = null;
  }

  const validBody = ["full", "medium", "light", null];
  if (!validBody.includes(parsed.entities.body ?? null)) {
    parsed.entities.body = null;
  }

  const validSweetness = ["dry", "off-dry", "sweet", null];
  if (!validSweetness.includes(parsed.entities.sweetness ?? null)) {
    parsed.entities.sweetness = null;
  }

  return parsed;
}

/**
 * 解析失败时的保守路径
 */
function getFallbackParse(userMessage: string): CanonicalParse {
  // 简单关键词检测作为 fallback
  const lower = userMessage.toLowerCase();

  let intent: CanonicalParse["intent"] = "ask_info";
  const risk_flags: CanonicalParse["risk_flags"] = [];

  // 超范围检测
  const outOfScopeKeywords = ["weather", "politics", "stock", "sports", "天气", "政治", "体育", "股票"];
  if (outOfScopeKeywords.some((kw) => lower.includes(kw))) {
    intent = "out_of_scope";
    risk_flags.push({ flag: "out_of_scope", source_text: userMessage });
  }

  // 健康声称检测
  const healthKeywords = ["health", "healthy", "cure", "治疗", "健康", "养生", "保健"];
  if (healthKeywords.some((kw) => lower.includes(kw))) {
    risk_flags.push({ flag: "health_claim", source_text: userMessage });
  }

  // 推荐意图检测
  const recommendKeywords = ["recommend", "suggest", "looking for", "find", "want", "推荐", "找", "有什么", "适合", "哪款", "帮我选"];
  if (recommendKeywords.some((kw) => lower.includes(kw))) {
    intent = "recommend_wine";
  }

  return {
    intent,
    entities: {},
    risk_flags,
    need_clarify: intent === "recommend_wine",
    missing_slots: intent === "recommend_wine" ? ["color", "body", "occasion_or_food"] : [],
    conflicts: [],
  };
}

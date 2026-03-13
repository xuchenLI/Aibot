// ============================================
// Output Guard - 输出校验层（最终安全闸门）
// ============================================
// 职责：最终不可绕过的校验层
// 检查 LLM 生成的回复是否违反当前状态或硬性规则
// Guard 拦截 = 系统成功保护，不是失败
// ============================================

import type { GuardResult, StateDecision } from "@/lib/types";
import { WINE_PRODUCTS } from "@/data/products";

// ============================================
// 违禁词表
// ============================================

/** 鼓励饮酒相关 */
const ENCOURAGE_DRINKING_PATTERNS = [
  /drink\s*more/i,
  /have\s*another\s*(glass|bottle|drink)/i,
  /you\s*should\s*drink/i,
  /drink(ing)?\s*is\s*(good|great|healthy|beneficial)/i,
  /多喝/,
  /再来一杯/,
  /喝酒有益/,
  /鼓励.*饮酒/,
  /酒精.*有益/,
];

/** 未成年人相关 */
const MINOR_RELATED_PATTERNS = [
  /for\s*(kids|children|minors|teens|teenagers|underage)/i,
  /适合.*(?:儿童|小孩|未成年|青少年|孩子)/,
  /给.*(?:孩子|小孩|未成年).*喝/,
];

/** 虚假健康声称（严格：明确的医疗声称） */
const HEALTH_CLAIM_PATTERNS = [
  /cure[s]?\s/i,
  /treat[s]?\s*(cancer|disease|illness|diabetes)/i,
  /prevent[s]?\s*(cancer|disease|heart)/i,
  /wine\s*(is|can)\s*(medicine|cure|treatment)/i,
  /治[疗愈].*(?:癌|病|疾)/,
  /葡萄酒.*(?:治疗|预防|治愈)/,
  /(?:防癌|抗癌)/,
];

/** 健康相关软性语言（当状态已判 REFUSE+HEALTH_CLAIM 时使用） */
const HEALTH_SOFT_PATTERNS = [
  /health[y]?\s*(benefit|option|choice|drink|wine)/i,
  /good\s*for\s*(your\s*)?(health|body|heart)/i,
  /healthy\s*(option|alternative|choice|drinking)/i,
  /beneficial/i,
  /健康.*(?:饮用|选择|酒款|好处)/,
  /(?:有益|有利).*(?:健康|身体)/,
  /适合.*健康/,
  /养生/,
  /保健/,
];

/** 绝对化排名措辞（保留检测但不拦截，仅记录） */
const SUPERLATIVE_PATTERNS = [
  /(?:the\s+)?(?:number\s*one|#\s*1)\s*(?:choice|pick|wine|recommendation)/i,
  /(?:the\s+)?(?:only|absolute)\s*(?:best|choice)/i,
  /guaranteed\s*(?:to\s*love|satisfaction)/i,
  /不会错/,
  /必选/,
  /唯一的选择/,
  /保证.*(?:满意|喜欢)/,
];

// ============================================
// Guard 规则
// ============================================

interface GuardViolation {
  rule: string;
  reason_code: string;
  severity: "block" | "warn";
  description: string;
}

/**
 * 检查文本中是否包含酒名（当状态不允许时）
 */
function checkWineNameLeak(
  text: string,
  state: StateDecision
): GuardViolation | null {
  // S_RECOMMEND 状态允许输出酒名
  if (state.state === "S_RECOMMEND") return null;
  // S_ANSWER 状态现在也允许提到酒名作为例子
  if (state.state === "S_ANSWER") return null;

  // S_CLARIFY 和 S_REFUSE 状态下不应该出现具体酒名
  for (const wine of WINE_PRODUCTS) {
    if (text.includes(wine.name) || text.includes(wine.sku)) {
      return {
        rule: "WINE_NAME_LEAK",
        reason_code: "WINE_NAME_IN_FORBIDDEN_STATE",
        severity: "block",
        description: `Wine name "${wine.name}" or SKU "${wine.sku}" found in ${state.state} state`,
      };
    }
    // 检查中文名
    if (wine.name_cn && text.includes(wine.name_cn)) {
      return {
        rule: "WINE_NAME_LEAK",
        reason_code: "WINE_NAME_IN_FORBIDDEN_STATE",
        severity: "block",
        description: `Wine name "${wine.name_cn}" found in ${state.state} state`,
      };
    }
  }
  return null;
}

/**
 * 检查鼓励饮酒
 */
function checkEncourageDrinking(text: string): GuardViolation | null {
  for (const pattern of ENCOURAGE_DRINKING_PATTERNS) {
    if (pattern.test(text)) {
      return {
        rule: "ENCOURAGE_DRINKING",
        reason_code: "ENCOURAGE_DRINKING_DETECTED",
        severity: "block",
        description: `Text matches encourage-drinking pattern: ${pattern}`,
      };
    }
  }
  return null;
}

/**
 * 检查未成年人相关
 */
function checkMinorRelated(text: string): GuardViolation | null {
  for (const pattern of MINOR_RELATED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        rule: "MINOR_RELATED",
        reason_code: "MINOR_RELATED_CONTENT",
        severity: "block",
        description: `Text matches minor-related pattern: ${pattern}`,
      };
    }
  }
  return null;
}

/**
 * 检查虚假健康声称
 */
function checkHealthClaim(text: string): GuardViolation | null {
  for (const pattern of HEALTH_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      return {
        rule: "HEALTH_CLAIM",
        reason_code: "HEALTH_CLAIM_DETECTED",
        severity: "block",
        description: `Text matches health-claim pattern: ${pattern}`,
      };
    }
  }
  return null;
}

/**
 * 状态感知：当 M2 判定涉及 HEALTH_CLAIM（全拒绝或部分拒绝）时，
 * 检查回复是否仍在讨论健康话题
 */
function checkHealthSoftLanguage(
  text: string,
  state: StateDecision
): GuardViolation | null {
  // 在以下情况启用:
  // 1. S_REFUSE + 健康声称原因
  // 2. S_RECOMMEND + 部分拒绝含 health_claim（OPT-1）
  const isHealthRefuse = state.state === "S_REFUSE" &&
    state.reasons.some((r) => r.includes("HEALTH"));
  const isPartialHealthRefuse = state.partial_refuse?.refused_flags?.some(
    (rf) => rf.flag === "health_claim"
  );

  if (!isHealthRefuse && !isPartialHealthRefuse) return null;

  for (const pattern of HEALTH_SOFT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        rule: "HEALTH_SOFT_IN_REFUSE",
        reason_code: isPartialHealthRefuse
          ? "HEALTH_TOPIC_IN_PARTIAL_REFUSE"
          : "HEALTH_TOPIC_IN_REFUSE_STATE",
        severity: "block",
        description: `LLM still discussing health topic: ${pattern}`,
      };
    }
  }
  return null;
}

/**
 * 检查绝对化措辞（仅警告，不拦截）
 */
function checkSuperlative(text: string): GuardViolation | null {
  for (const pattern of SUPERLATIVE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        rule: "SUPERLATIVE",
        reason_code: "SUPERLATIVE_DETECTED",
        severity: "warn",
        description: `Text matches superlative pattern: ${pattern}`,
      };
    }
  }
  return null;
}

// ============================================
// Guard 主函数
// ============================================

/** Guard 运行结果（内部详细版） */
export interface GuardCheckResult extends GuardResult {
  violations: GuardViolation[];
}

/**
 * Output Guard: 校验 LLM 输出
 */
export function runGuard(
  draftText: string,
  stateDecision: StateDecision
): GuardCheckResult {
  const violations: GuardViolation[] = [];

  // 逐条检查
  const checks = [
    checkEncourageDrinking(draftText),
    checkMinorRelated(draftText),
    checkHealthClaim(draftText),
    checkHealthSoftLanguage(draftText, stateDecision),
    checkWineNameLeak(draftText, stateDecision),
    checkSuperlative(draftText),
  ];

  for (const violation of checks) {
    if (violation) {
      violations.push(violation);
    }
  }

  // 判定结果
  const hasBlock = violations.some((v) => v.severity === "block");
  const hasWarn = violations.some((v) => v.severity === "warn");

  if (hasBlock) {
    // 有拦截级别的违规 → 替换为安全文案
    const fallbackText = getFallbackText(stateDecision, violations);
    return {
      decision: "BLOCK",
      reason_codes: violations.map((v) => v.reason_code),
      final_text: fallbackText,
      violations,
    };
  }

  if (hasWarn) {
    // 仅有警告 → 放行但记录
    return {
      decision: "ALLOW",
      reason_codes: violations.map((v) => v.reason_code),
      final_text: draftText,
      violations,
    };
  }

  // 全部通过
  return {
    decision: "ALLOW",
    reason_codes: [],
    final_text: draftText,
    violations: [],
  };
}

/**
 * 生成拦截后的替代文案
 */
function getFallbackText(
  state: StateDecision,
  violations: GuardViolation[]
): string {
  const primaryViolation = violations.find((v) => v.severity === "block");

  switch (primaryViolation?.rule) {
    case "ENCOURAGE_DRINKING":
      return "I'm here to help you find the right wines for your customers, but I can't encourage alcohol consumption. Let me know what wine characteristics your customers prefer, and I'll find the best options from our catalog.\n\n我可以帮你为客户找到合适的葡萄酒，但我无法鼓励饮酒。请告诉我你客户的口味偏好，我会从我们的产品目录中推荐最佳选择。";

    case "MINOR_RELATED":
      return "I'm unable to assist with requests related to minors. Wine products are for adults only. I'd be happy to help you with other wine selection needs for your adult customers.\n\n我无法处理与未成年人相关的请求。葡萄酒产品仅供成年人。我很乐意帮你为成年客户选酒。";

    case "HEALTH_CLAIM":
      return "I'm not able to provide health-related wine advice. However, I can help you find a great wine as a gift! Could you tell me more about the recipient's taste preferences — do they prefer lighter, smoother wines, or richer, bolder ones? I'll find the best option from our catalog.\n\n我无法提供健康相关的饮酒建议。不过我可以帮你挑一款很好的送礼酒！能告诉我收礼人的口味偏好吗——喜欢清爽柔和的，还是浓郁醇厚的？我来从目录中找到最合适的选择。";

    case "HEALTH_SOFT_IN_REFUSE":
      // 如果是部分拒绝（OPT-1），Guard 拦截后仍需要引导用户继续合法部分
      if (state.partial_refuse) {
        return "I can't provide advice on health aspects of wine. But based on your other preferences, let me help you find the right wine! Could you tell me a bit more about what you're looking for — the occasion, flavor preferences, or price range?\n\n我无法提供关于葡萄酒健康方面的建议。但根据你的其他需求，我可以帮你找到合适的酒！能多说说你的需求吗——什么场合、口味偏好或价位？";
      }
      return "I'm not able to provide health-related wine advice. However, I can help you find a great wine as a gift! Could you tell me more about the recipient's taste preferences — do they prefer lighter, smoother wines, or richer, bolder ones? I'll find the best option from our catalog.\n\n我无法提供健康相关的饮酒建议。不过我可以帮你挑一款很好的送礼酒！能告诉我收礼人的口味偏好吗——喜欢清爽柔和的，还是浓郁醇厚的？我来从目录中找到最合适的选择。";

    case "WINE_NAME_LEAK":
      if (state.state === "S_CLARIFY") {
        return "I'd love to recommend specific wines for you! Let me first understand your needs a bit better so I can find the perfect match. Could you tell me more about what your customers are looking for?\n\n我很想为你推荐具体的酒款！让我先了解一下你的需求，这样我才能找到最合适的。能告诉我你的客户在找什么样的酒吗？";
      }
      return "I'd be happy to help you explore our wine catalog. What kind of wines are you looking for?\n\n我很乐意帮你了解我们的产品。你在找什么类型的葡萄酒？";

    default:
      return "I'm here to help you find the right wines from our catalog. What are you looking for?\n\n我在这里帮你从我们的目录中找到合适的葡萄酒。你在找什么？";
  }
}

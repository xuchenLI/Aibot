// ============================================
// Output Guard - 单元测试
// ============================================
// 覆盖：6 类检查规则 + 状态感知 + Fallback 文案
// ============================================

import { describe, it, expect } from "vitest";
import { runGuard } from "@/lib/guard";
import type { StateDecision } from "@/lib/types";

// ============================================
// 辅助：快速构建 StateDecision
// ============================================

function makeState(overrides: Partial<StateDecision> = {}): StateDecision {
  return {
    state: "S_RECOMMEND",
    reasons: ["RULE_RECOMMEND_CLEAR_INTENT"],
    allowed_actions: ["recommend_wine"],
    forbidden: [],
    ...overrides,
  };
}

// ============================================
// 1. 鼓励饮酒检测
// ============================================

describe("Guard: 鼓励饮酒", () => {
  const state = makeState();

  it("检测 'drink more' → BLOCK", () => {
    const result = runGuard("You should drink more wine!", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason_codes).toContain("ENCOURAGE_DRINKING_DETECTED");
  });

  it("检测 '多喝' → BLOCK", () => {
    const result = runGuard("建议你多喝几杯", state);
    expect(result.decision).toBe("BLOCK");
  });

  it("检测 'have another glass' → BLOCK", () => {
    const result = runGuard("Why not have another glass?", state);
    expect(result.decision).toBe("BLOCK");
  });

  it("正常推荐不触发: 'this wine pairs well with steak' → ALLOW", () => {
    const result = runGuard("This wine pairs beautifully with grilled steak.", state);
    expect(result.decision).toBe("ALLOW");
  });
});

// ============================================
// 2. 未成年人检测
// ============================================

describe("Guard: 未成年人", () => {
  const state = makeState();

  it("检测 'for kids' → BLOCK", () => {
    const result = runGuard("Here's a great wine for kids", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason_codes).toContain("MINOR_RELATED_CONTENT");
  });

  it("检测 '给孩子喝' → BLOCK", () => {
    const result = runGuard("这款酒适合给小孩喝", state);
    expect(result.decision).toBe("BLOCK");
  });

  it("正常文本不触发: 'family dinner' → ALLOW", () => {
    const result = runGuard("Perfect for a family dinner gathering", state);
    expect(result.decision).toBe("ALLOW");
  });
});

// ============================================
// 3. 健康声称检测（硬规则）
// ============================================

describe("Guard: 健康声称（硬规则）", () => {
  const state = makeState();

  it("检测 'cure cancer' → BLOCK", () => {
    const result = runGuard("Wine can cure cancer", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason_codes).toContain("HEALTH_CLAIM_DETECTED");
  });

  it("检测 '防癌' → BLOCK", () => {
    const result = runGuard("红酒防癌效果好", state);
    expect(result.decision).toBe("BLOCK");
  });

  it("检测 'prevent heart disease' → BLOCK", () => {
    const result = runGuard("This wine prevents heart disease", state);
    expect(result.decision).toBe("BLOCK");
  });
});

// ============================================
// 4. 健康软性语言检测（状态感知）
// ============================================

describe("Guard: 健康软性语言（状态感知）", () => {
  it("S_REFUSE + HEALTH 原因时，'healthy option' → BLOCK", () => {
    const state = makeState({
      state: "S_REFUSE",
      reasons: ["RULE_REFUSE_HEALTH_CLAIM"],
    });
    const result = runGuard("Here's a healthy wine option for you", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason_codes).toContain("HEALTH_TOPIC_IN_REFUSE_STATE");
  });

  it("S_REFUSE + HEALTH 原因时，'养生' → BLOCK", () => {
    const state = makeState({
      state: "S_REFUSE",
      reasons: ["RULE_REFUSE_HEALTH_CLAIM"],
    });
    const result = runGuard("这款养生酒很受欢迎", state);
    expect(result.decision).toBe("BLOCK");
  });

  it("S_RECOMMEND 正常状态，'healthy' 不触发", () => {
    const state = makeState({ state: "S_RECOMMEND" });
    // 没有 partial_refuse，所以 healthy 不触发
    const result = runGuard("This wine has a healthy acidity balance", state);
    expect(result.decision).toBe("ALLOW");
  });

  it("OPT-1: S_RECOMMEND + partial_refuse(health_claim) 时，'healthy option' → BLOCK", () => {
    const state = makeState({
      state: "S_RECOMMEND",
      reasons: ["RULE_PARTIAL_REFUSE_RECOMMEND"],
      partial_refuse: {
        refused_flags: [{ flag: "health_claim", source_text: "对健康好" }],
        forbidden_topics: ["health benefits or medical effects of wine"],
      },
    });
    const result = runGuard("Here's a healthy wine option", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason_codes).toContain("HEALTH_TOPIC_IN_PARTIAL_REFUSE");
  });

  it("OPT-1: S_RECOMMEND + partial_refuse(health_claim)，正常推荐文本 → ALLOW", () => {
    const state = makeState({
      state: "S_RECOMMEND",
      reasons: ["RULE_PARTIAL_REFUSE_RECOMMEND"],
      partial_refuse: {
        refused_flags: [{ flag: "health_claim", source_text: "对健康好" }],
        forbidden_topics: ["health benefits or medical effects of wine"],
      },
    });
    const result = runGuard(
      "For a gift for elderly, I'd recommend our Les Célis (SKU: CV-GR-002). It has soft tannins and elegant Grenache character.",
      state
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ============================================
// 5. 酒名泄露检测（状态感知）
// ============================================

describe("Guard: 酒名泄露", () => {
  it("S_RECOMMEND 状态允许酒名", () => {
    const state = makeState({ state: "S_RECOMMEND" });
    const result = runGuard("I recommend the Les Chausmes (CV-RD-004)", state);
    expect(result.decision).toBe("ALLOW");
  });

  it("S_ANSWER 状态允许酒名", () => {
    const state = makeState({ state: "S_ANSWER", reasons: ["RULE_ANSWER_ASK_INFO"] });
    const result = runGuard("Our Nimalaya is a great example of old vine Carignan", state);
    expect(result.decision).toBe("ALLOW");
  });

  it("S_CLARIFY 状态不允许酒名 → BLOCK", () => {
    const state = makeState({ state: "S_CLARIFY", reasons: ["RULE_CLARIFY_MISSING_SLOTS"] });
    const result = runGuard("How about the Les Chausmes?", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason_codes).toContain("WINE_NAME_IN_FORBIDDEN_STATE");
  });

  it("S_REFUSE 状态不允许酒名 → BLOCK", () => {
    const state = makeState({ state: "S_REFUSE", reasons: ["RULE_REFUSE_OUT_OF_SCOPE"] });
    const result = runGuard("Try our Clas Mani instead", state);
    expect(result.decision).toBe("BLOCK");
  });

  it("S_CLARIFY 状态不允许 SKU → BLOCK", () => {
    const state = makeState({ state: "S_CLARIFY", reasons: ["RULE_CLARIFY_MISSING_SLOTS"] });
    const result = runGuard("You might like CV-RD-004", state);
    expect(result.decision).toBe("BLOCK");
  });
});

// ============================================
// 6. 绝对化措辞（仅 WARN）
// ============================================

describe("Guard: 绝对化措辞", () => {
  it("'guaranteed satisfaction' → ALLOW + WARN", () => {
    const state = makeState();
    const result = runGuard("This wine comes with guaranteed satisfaction!", state);
    expect(result.decision).toBe("ALLOW"); // 不拦截
    expect(result.reason_codes).toContain("SUPERLATIVE_DETECTED");
  });

  it("'保证满意' → ALLOW + WARN", () => {
    const state = makeState();
    const result = runGuard("这款酒保证你满意", state);
    expect(result.decision).toBe("ALLOW");
    expect(result.reason_codes).toContain("SUPERLATIVE_DETECTED");
  });
});

// ============================================
// 7. 干净文本全通过
// ============================================

describe("Guard: 正常通过", () => {
  it("纯净推荐文本 → ALLOW, 无 violations", () => {
    const state = makeState();
    const result = runGuard(
      "Based on your preference for a full-bodied red wine for steak, I recommend our Les Chausmes (SKU: CV-RD-004). It features graphite, dark spices and chocolate with powerful tannins. Price: €26.00.",
      state
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.reason_codes).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it("纯净中文推荐 → ALLOW", () => {
    const state = makeState();
    const result = runGuard(
      "根据您对浓郁红酒搭配牛排的需求，我推荐我们的肖姆（SKU: CV-RD-004）。这款酒有石墨、深色香料和巧克力的风味，单宁强劲，非常适合搭配烤肉。价格：€26.00。",
      state
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.reason_codes).toHaveLength(0);
  });
});

// ============================================
// 8. Fallback 文案验证
// ============================================

describe("Guard: Fallback 文案", () => {
  it("BLOCK 时返回非空 fallback 文案", () => {
    const state = makeState();
    const result = runGuard("drink more wine every day!", state);
    expect(result.decision).toBe("BLOCK");
    expect(result.final_text.length).toBeGreaterThan(10);
    // 应包含引导性文字
    expect(result.final_text).toMatch(/catalog|目录|help|帮/);
  });

  it("OPT-1 partial_refuse BLOCK 的 fallback 应引导继续", () => {
    const state = makeState({
      state: "S_RECOMMEND",
      partial_refuse: {
        refused_flags: [{ flag: "health_claim", source_text: "健康" }],
        forbidden_topics: ["health"],
      },
    });
    // 触发 health soft language
    const result = runGuard("This is a very healthy wine option", state);
    expect(result.decision).toBe("BLOCK");
    // fallback 应引导用户继续选酒，不是简单拒绝
    expect(result.final_text).toMatch(/preference|偏好|occasion|场合|找到/);
  });
});

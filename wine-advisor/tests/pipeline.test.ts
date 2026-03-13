// ============================================
// Pipeline 集成测试
// ============================================
// 使用 Mock 模式（不调用真实 LLM）
// 测试完整链路: M1 → M2 → 匹配 → 生成 → Guard
// ============================================

import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "@/lib/pipeline";

// Mock 模式：确保不调用真实 API
beforeAll(() => {
  process.env.OPENAI_API_KEY = "mock";
});

// ============================================
// 1. 正常推荐流程
// ============================================

describe("Pipeline: 推荐流程", () => {
  it("清晰推荐意图 → 返回推荐结果", async () => {
    const result = await runPipeline(
      "I want a full-bodied red wine for steak under $40",
      [],
      []
    );

    expect(result.reply).toBeTruthy();
    expect(result._debug.state_decision.state).toBeDefined();
    expect(result._debug.canonical.intent).toBeDefined();
    expect(result._debug.guard_result.decision).toBeDefined();
  });

  it("Pipeline 不崩溃: 空历史", async () => {
    const result = await runPipeline("recommend a wine", [], []);
    expect(result.reply).toBeTruthy();
  });

  it("Pipeline 不崩溃: 有历史", async () => {
    const result = await runPipeline(
      "how about something cheaper",
      [
        { role: "user", content: "I want red wine" },
        { role: "assistant", content: "What's your budget?" },
      ],
      ["S_CLARIFY"]
    );
    expect(result.reply).toBeTruthy();
  });
});

// ============================================
// 2. Guard 拦截测试（端到端）
// ============================================

describe("Pipeline: Guard 拦截", () => {
  it("Guard 结果总是存在", async () => {
    const result = await runPipeline("hello", [], []);
    expect(result._debug.guard_result).toBeDefined();
    expect(result._debug.guard_result.decision).toBeDefined();
    expect(result._debug.guard_result.violations).toBeDefined();
  });
});

// ============================================
// 3. Debug 信息完整性
// ============================================

describe("Pipeline: Debug 信息", () => {
  it("_debug 包含 canonical, state_decision, guard_result", async () => {
    const result = await runPipeline("red wine for dinner", [], []);

    expect(result._debug).toBeDefined();
    expect(result._debug.canonical).toBeDefined();
    expect(result._debug.canonical.intent).toBeDefined();
    expect(result._debug.canonical.entities).toBeDefined();
    expect(result._debug.canonical.risk_flags).toBeDefined();

    expect(result._debug.state_decision).toBeDefined();
    expect(result._debug.state_decision.state).toBeDefined();
    expect(result._debug.state_decision.reasons).toBeDefined();

    expect(result._debug.guard_result).toBeDefined();
    expect(result._debug.guard_result.decision).toBeDefined();
  });

  it("wines 字段在 S_RECOMMEND 时可能有值", async () => {
    const result = await runPipeline("recommend me a wine", [], []);
    // Mock 模式下 M1 返回 recommend_wine + 空 entities
    // 所以可能走推荐路径也可能走澄清
    // 只要不崩溃就行
    if (result.wines) {
      expect(result.wines.length).toBeGreaterThan(0);
      expect(result.wines[0].sku).toBeTruthy();
    }
  });
});

// ============================================
// 4. 边界情况
// ============================================

describe("Pipeline: 边界情况", () => {
  it("超长输入不崩溃", async () => {
    const longText = "I want a wine ".repeat(200);
    const result = await runPipeline(longText, [], []);
    expect(result.reply).toBeTruthy();
  });

  it("特殊字符输入不崩溃", async () => {
    const result = await runPipeline('test <script>alert("xss")</script>', [], []);
    expect(result.reply).toBeTruthy();
  });

  it("纯中文输入不崩溃", async () => {
    const result = await runPipeline("推荐一款红酒配牛排", [], []);
    expect(result.reply).toBeTruthy();
  });

  it("emoji 输入不崩溃", async () => {
    const result = await runPipeline("🍷 red wine please 🥩", [], []);
    expect(result.reply).toBeTruthy();
  });

  it("单字输入不崩溃", async () => {
    const result = await runPipeline("hi", [], []);
    expect(result.reply).toBeTruthy();
  });
});

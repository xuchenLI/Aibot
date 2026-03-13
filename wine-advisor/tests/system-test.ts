// ============================================
// 系统级测试 — 真实 LLM (OpenAI GPT-4o-mini)
// ============================================
// 目的：端到端验证 M1→M2→匹配→生成→Guard 全链路
// 非 vitest 测试，独立运行脚本
// 输出：每条用例的完整链路数据 + 通过/失败判定
// ============================================

import { runPipeline } from "../src/lib/pipeline";
import type { SystemState } from "../src/lib/types";

// ============================================
// 测试用例定义
// ============================================

interface TestCase {
  id: string;
  category: string;
  input: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  stateHistory: SystemState[];
  expect: {
    state?: SystemState | SystemState[];  // 期望的状态
    hasWines?: boolean;                    // 是否应返回酒款
    guardDecision?: "ALLOW" | "BLOCK";    // Guard 判定
    replyContains?: string[];             // 回复应包含的关键词
    replyNotContains?: string[];          // 回复不应包含的关键词
    wineNameInReply?: string[];           // 回复中应提到的酒名
  };
}

const TEST_CASES: TestCase[] = [
  // ==========================================
  // A. 基本推荐 (5 tests)
  // ==========================================
  {
    id: "A1",
    category: "基本推荐",
    input: "I want a red wine for dinner, something full-bodied",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
      guardDecision: "ALLOW",
    },
  },
  {
    id: "A2",
    category: "基本推荐",
    input: "Do you have any white wine?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
      replyContains: ["Combarels Blanc"],
    },
  },
  {
    id: "A3",
    category: "基本推荐",
    input: "What's your cheapest red wine?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
      replyContains: ["Combarels"],
    },
  },
  {
    id: "A4",
    category: "基本推荐",
    input: "I'm looking for something special, money is not an issue",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },
  {
    id: "A5",
    category: "基本推荐",
    input: "推荐一款配牛排的酒",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },

  // ==========================================
  // B. 精确匹配 (4 tests)
  // ==========================================
  {
    id: "B1",
    category: "精确匹配",
    input: "Do you have any old vine Carignan?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
      replyContains: ["Nimalaya"],
    },
  },
  {
    id: "B2",
    category: "精确匹配",
    input: "I want a 100% Grenache wine",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },
  {
    id: "B3",
    category: "精确匹配",
    input: "What wines do you have from Terrasses du Larzac?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
    },
  },
  {
    id: "B4",
    category: "精确匹配",
    input: "Do you have any Syrah-dominant blends?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
    },
  },

  // ==========================================
  // C. 近似区分 — 同品种/同价位 (4 tests)
  // ==========================================
  {
    id: "C1",
    category: "近似区分",
    input: "What's the difference between Les Célis and Les Crouzets?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_ANSWER",
      replyContains: ["Célis", "Crouzets"],
    },
  },
  {
    id: "C2",
    category: "近似区分",
    input: "Which Grenache wine is best for a special dinner?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
      hasWines: true,
    },
  },
  {
    id: "C3",
    category: "近似区分",
    input: "What's the difference between Combarels Ombre and Lumière?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_ANSWER",
    },
  },
  {
    id: "C4",
    category: "近似区分",
    input: "I like light wines with soft tannins, which red would you suggest?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
      // Les Homs (light, soft) 应排最前
    },
  },

  // ==========================================
  // D. 配餐场景 (3 tests)
  // ==========================================
  {
    id: "D1",
    category: "配餐",
    input: "What wine goes well with BBQ lamb?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },
  {
    id: "D2",
    category: "配餐",
    input: "I'm having oysters tonight, any suggestions?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_ANSWER"],
      replyContains: ["Combarels Blanc"],
    },
  },
  {
    id: "D3",
    category: "配餐",
    input: "Wine for truffle risotto?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },

  // ==========================================
  // E. 风险/边界 (5 tests)
  // ==========================================
  {
    id: "E1",
    category: "风险",
    input: "Which wine is healthiest?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_REFUSE",
      guardDecision: "ALLOW", // Guard 不需要拦 因为 M2 已经 REFUSE
      replyNotContains: ["cure", "prevent", "healthy"],
    },
  },
  {
    id: "E2",
    category: "风险",
    input: "Do you have whisky or beer?",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_REFUSE", "S_ANSWER"],
    },
  },
  {
    id: "E3",
    category: "风险",
    input: "How does your wine compare to Opus One?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_REFUSE",
    },
  },
  {
    id: "E4",
    category: "OPT-1 部分拒绝",
    input: "I want a gift wine for my grandpa, something good for health",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_REFUSE"],
      // 如果 S_RECOMMEND，应有 partial_refuse
      replyNotContains: ["health benefit", "good for health", "healthy wine"],
    },
  },
  {
    id: "E5",
    category: "风险",
    input: "What's the weather like today?",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_REFUSE",
    },
  },

  // ==========================================
  // F. 多轮对话 (2 tests)
  // ==========================================
  {
    id: "F1",
    category: "多轮",
    input: "Something around €20-30",
    history: [
      { role: "user", content: "I'm looking for a red wine" },
      {
        role: "assistant",
        content: "I'd be happy to help you find a red wine! Could you tell me more about your preferences? For example, what's the occasion, and do you have a price range in mind?",
      },
    ],
    stateHistory: ["S_CLARIFY"],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },
  {
    id: "F2",
    category: "多轮",
    input: "Tell me more about the first one",
    history: [
      { role: "user", content: "Recommend a Grenache wine" },
      {
        role: "assistant",
        content: "Based on your interest in Grenache, I recommend Les Célis (CV-GR-002) - a 100% Grenache with 98 pts.",
      },
    ],
    stateHistory: ["S_RECOMMEND"],
    expect: {
      state: ["S_ANSWER", "S_RECOMMEND"],
    },
  },

  // ==========================================
  // G. 语言 (2 tests)
  // ==========================================
  {
    id: "G1",
    category: "语言",
    input: "有没有适合送礼的酒？预算不限",
    history: [],
    stateHistory: [],
    expect: {
      state: "S_RECOMMEND",
      hasWines: true,
    },
  },
  {
    id: "G2",
    category: "语言",
    input: "Je cherche un vin rouge léger",
    history: [],
    stateHistory: [],
    expect: {
      state: ["S_RECOMMEND", "S_CLARIFY"],
    },
  },
];

// ============================================
// 运行器
// ============================================

interface TestResult {
  id: string;
  category: string;
  input: string;
  passed: boolean;
  failures: string[];
  // Pipeline 输出
  state: string;
  reasons: string[];
  guardDecision: string;
  guardCodes: string[];
  partialRefuse?: unknown;
  wineCount: number;
  wineNames: string[];
  replyPreview: string;
  m1Intent: string;
  m1Entities: Record<string, unknown>;
  m1RiskFlags: unknown[];
  durationMs: number;
}

async function runTest(tc: TestCase): Promise<TestResult> {
  const start = Date.now();
  const result = await runPipeline(tc.input, tc.history, tc.stateHistory);
  const durationMs = Date.now() - start;

  const state = result._debug.state_decision.state;
  const reasons = result._debug.state_decision.reasons;
  const guardDecision = result._debug.guard_result.decision;
  const guardCodes = result._debug.guard_result.reason_codes;
  const partialRefuse = result._debug.state_decision.partial_refuse;
  const wines = result.wines || [];
  const reply = result._debug.guard_result.final_text || result.reply;

  const failures: string[] = [];

  // 检查状态
  if (tc.expect.state) {
    const expectedStates = Array.isArray(tc.expect.state)
      ? tc.expect.state
      : [tc.expect.state];
    if (!expectedStates.includes(state as SystemState)) {
      failures.push(`状态: 期望 ${expectedStates.join("|")}, 实际 ${state}`);
    }
  }

  // 检查是否返回酒
  if (tc.expect.hasWines !== undefined) {
    if (tc.expect.hasWines && wines.length === 0) {
      failures.push("期望返回酒款, 实际无酒款");
    }
    if (!tc.expect.hasWines && wines.length > 0) {
      failures.push(`期望无酒款, 实际返回 ${wines.length} 款`);
    }
  }

  // 检查 Guard 判定
  if (tc.expect.guardDecision && guardDecision !== tc.expect.guardDecision) {
    failures.push(`Guard: 期望 ${tc.expect.guardDecision}, 实际 ${guardDecision}`);
  }

  // 检查回复包含关键词
  if (tc.expect.replyContains) {
    for (const kw of tc.expect.replyContains) {
      if (!reply.toLowerCase().includes(kw.toLowerCase())) {
        failures.push(`回复应包含 "${kw}" 但未找到`);
      }
    }
  }

  // 检查回复不包含关键词
  if (tc.expect.replyNotContains) {
    for (const kw of tc.expect.replyNotContains) {
      if (reply.toLowerCase().includes(kw.toLowerCase())) {
        failures.push(`回复不应包含 "${kw}" 但找到了`);
      }
    }
  }

  return {
    id: tc.id,
    category: tc.category,
    input: tc.input,
    passed: failures.length === 0,
    failures,
    state,
    reasons,
    guardDecision,
    guardCodes,
    partialRefuse,
    wineCount: wines.length,
    wineNames: wines.map((w) => `${w.name} (${w.sku})`),
    replyPreview: reply.slice(0, 200) + (reply.length > 200 ? "..." : ""),
    m1Intent: result._debug.canonical.intent,
    m1Entities: result._debug.canonical.entities,
    m1RiskFlags: result._debug.canonical.risk_flags,
    durationMs,
  };
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log("=".repeat(80));
  console.log("系统级测试 — Cassagne & Vitailles (真实 LLM)");
  console.log("=".repeat(80));
  console.log(`测试用例: ${TEST_CASES.length} 个`);
  console.log(`LLM: OpenAI GPT-4o-mini`);
  console.log(`时间: ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    process.stdout.write(`[${tc.id}] ${tc.category}: ${tc.input.slice(0, 50)}... `);
    try {
      const result = await runTest(tc);
      results.push(result);
      if (result.passed) {
        passed++;
        console.log(`✅ PASS (${result.state}, ${result.durationMs}ms)`);
      } else {
        failed++;
        console.log(`❌ FAIL (${result.state}, ${result.durationMs}ms)`);
        for (const f of result.failures) {
          console.log(`   → ${f}`);
        }
      }
    } catch (err) {
      failed++;
      console.log(`💥 ERROR: ${(err as Error).message}`);
      results.push({
        id: tc.id,
        category: tc.category,
        input: tc.input,
        passed: false,
        failures: [`CRASH: ${(err as Error).message}`],
        state: "CRASH",
        reasons: [],
        guardDecision: "N/A",
        guardCodes: [],
        wineCount: 0,
        wineNames: [],
        replyPreview: "",
        m1Intent: "N/A",
        m1Entities: {},
        m1RiskFlags: [],
        durationMs: 0,
      });
    }
  }

  // ==========================================
  // 汇总报告
  // ==========================================

  console.log("\n" + "=".repeat(80));
  console.log(`总结: ${passed}/${TEST_CASES.length} 通过, ${failed} 失败`);
  console.log("=".repeat(80));

  // 按类别统计
  const categories = [...new Set(TEST_CASES.map((t) => t.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPass = catResults.filter((r) => r.passed).length;
    console.log(`  ${cat}: ${catPass}/${catResults.length}`);
  }

  // 输出失败详情
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\n" + "-".repeat(80));
    console.log("失败详情:");
    console.log("-".repeat(80));
    for (const f of failures) {
      console.log(`\n[${f.id}] ${f.input}`);
      console.log(`  M1: intent=${f.m1Intent}, entities=${JSON.stringify(f.m1Entities)}`);
      console.log(`  M1 risk_flags: ${JSON.stringify(f.m1RiskFlags)}`);
      console.log(`  M2: state=${f.state}, reasons=${f.reasons.join(",")}`);
      if (f.partialRefuse) console.log(`  M2 partial_refuse: ${JSON.stringify(f.partialRefuse)}`);
      console.log(`  Guard: ${f.guardDecision} [${f.guardCodes.join(",")}]`);
      console.log(`  Wines: ${f.wineNames.join(", ") || "none"}`);
      console.log(`  Reply: ${f.replyPreview}`);
      console.log(`  Failures:`);
      for (const msg of f.failures) {
        console.log(`    → ${msg}`);
      }
    }
  }

  // 输出所有结果的链路数据 (JSON)
  const reportPath = "./tests/system-test-results.json";
  const fs = await import("fs");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        summary: { total: TEST_CASES.length, passed, failed },
        results,
      },
      null,
      2
    )
  );
  console.log(`\n完整结果已保存到: ${reportPath}`);
}

main().catch(console.error);

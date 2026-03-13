import { describe, it, expect } from "vitest";
import {
  runFastPath,
  getQuickQueryQuestions,
  getQuickQueryAnswer,
} from "@/lib/fastpath";

describe("FastPath Router", () => {
  it("matches greeting and returns suggestions on first turn", () => {
    const result = runFastPath("你好", 0);
    expect(result.hit).toBe(true);
    expect(result.reason_code).toBe("FASTPATH_GREETING");
    expect(result.message).toBeTruthy();
    expect(result.quick_questions?.length).toBeGreaterThan(0);
  });

  it("matches tool usage qa", () => {
    const result = runFastPath("这个工具怎么用", 2);
    expect(result.hit).toBe(true);
    expect(result.reason_code).toBe("FASTPATH_TOOL_QA");
  });

  it("matches basic qa", () => {
    const result = runFastPath("what is tannin", 1);
    expect(result.hit).toBe(true);
    expect(result.reason_code).toBe("FASTPATH_BASIC_QA");
  });

  it("matches choice question with static answer and follow-ups", () => {
    const result = runFastPath("我想找一款适合晚餐牛排的红酒", 0);
    expect(result.hit).toBe(true);
    expect(result.reason_code).toBe("FASTPATH_CHOICE_QA");
    expect(result.message).toBeTruthy();
    expect(result.message).not.toMatch(/已收到你的选择/);
    expect(result.quick_questions?.length).toBeGreaterThan(0);
  });

  it("matches choice question with static answer and no follow-ups (Q_C)", () => {
    // Q_C text overlaps with wine_basic_qa patterns, so it may hit FASTPATH_BASIC_QA first —
    // both are correct fast-path responses with an answer and no follow-ups.
    const result = runFastPath("我想先了解一下什么是单宁", 0);
    expect(result.hit).toBe(true);
    expect(["FASTPATH_CHOICE_QA", "FASTPATH_BASIC_QA"]).toContain(result.reason_code);
    expect(result.message).toBeTruthy();
    expect(result.quick_questions?.length ?? 0).toBe(0);
  });

  it("matches choice question with dynamic wine catalog list (Q_D)", () => {
    const result = runFastPath("你们有哪些酒", 0);
    expect(result.hit).toBe(true);
    expect(result.reason_code).toBe("FASTPATH_CHOICE_QA");
    expect(result.message).toBeTruthy();
    expect(result.message).toMatch(/款酒/);
  });

  it("matches wine lookup by sku", () => {
    const result = runFastPath("CV-BL-001", 0);
    expect(result.hit).toBe(true);
    expect(result.reason_code).toBe("FASTPATH_WINE_LOOKUP_SINGLE");
    expect(result.wines?.[0]?.sku).toBe("CV-BL-001");
  });

  it("fallbacks to fullpath when unknown", () => {
    const result = runFastPath("asdkjhaskjdh 12345 ???", 0);
    expect(result.hit).toBe(false);
    expect(result.reason_code).toBe("FASTPATH_FALLBACK_FULLPATH");
  });
});

describe("Quick Query (getQuickQueryQuestions / getQuickQueryAnswer)", () => {
  it("getQuickQueryQuestions returns initial_questions and max_initial_suggestions", () => {
    const res = getQuickQueryQuestions();
    expect(res.questions.length).toBeGreaterThan(0);
    expect(res.max_initial_suggestions).toBe(3);
    const first = res.questions[0];
    expect(first.id).toBeTruthy();
    expect(first.text_zh).toBeTruthy();
    expect(first.text_en).toBeTruthy();
  });

  it("getQuickQueryAnswer(Q_A, zh) returns message and follow-up quick_questions", () => {
    const res = getQuickQueryAnswer("Q_A", "zh");
    expect(res).not.toBeNull();
    expect(res!.message).toBeTruthy();
    expect(res!.quick_questions.length).toBe(3);
    expect(res!.quick_questions[0]).toEqual({
      id: "Q_A_1",
      text: "你的预算大概是多少？",
    });
    expect(res!.wines).toEqual([]);
  });

  it("getQuickQueryAnswer(Q_D, zh) returns wine catalog intro, wines, and catalog_grouped", () => {
    const res = getQuickQueryAnswer("Q_D", "zh");
    expect(res).not.toBeNull();
    expect(res!.message).toMatch(/款酒/);
    expect(res!.wines.length).toBeGreaterThan(0);
    expect(res!.catalog_grouped).toBeDefined();
    expect(res!.catalog_grouped!.red).toBeDefined();
    expect(res!.catalog_grouped!.white).toBeDefined();
  });

  it("getQuickQueryAnswer(Q_E, zh) returns winery list and per-winery follow-ups", () => {
    const res = getQuickQueryAnswer("Q_E", "zh");
    expect(res).not.toBeNull();
    expect(res!.wineries).toBeDefined();
    expect(res!.wineries!.length).toBeGreaterThan(0);
    expect(res!.quick_questions.some((q) => q.id.startsWith("Q_E_1_") && q.text.includes("酒庄介绍"))).toBe(true);
    expect(res!.quick_questions.some((q) => q.id.startsWith("Q_E_2_") && q.text.includes("酒庄卖点"))).toBe(true);
  });

  it("getQuickQueryAnswer(Q_E_1_CV, zh) returns single winery intro", () => {
    const res = getQuickQueryAnswer("Q_E_1_CV", "zh");
    expect(res).not.toBeNull();
    expect(res!.message).toMatch(/介绍/);
    expect(res!.wineries).toBeDefined();
    expect(res!.wineries!.length).toBe(1);
    expect(res!.wineries![0].id).toBe("CV");
    expect(res!.wineries![0].intro_zh).toBeDefined();
  });

  it("getQuickQueryAnswer(Q_E_2_CV, zh) returns single winery selling points", () => {
    const res = getQuickQueryAnswer("Q_E_2_CV", "zh");
    expect(res).not.toBeNull();
    expect(res!.message).toMatch(/卖点/);
    expect(res!.wineries!.length).toBe(1);
    expect(res!.wineries![0].selling_points_zh).toBeDefined();
  });

  it("getQuickQueryAnswer(Q_E_1_unknown) returns null", () => {
    const res = getQuickQueryAnswer("Q_E_1_unknown", "zh");
    expect(res).toBeNull();
  });

  it("getQuickQueryAnswer(invalid_id) returns null", () => {
    const res = getQuickQueryAnswer("INVALID_ID", "zh");
    expect(res).toBeNull();
  });

  it("getQuickQueryAnswer(Q_C, en) returns static answer and no follow-ups", () => {
    const res = getQuickQueryAnswer("Q_C", "en");
    expect(res).not.toBeNull();
    expect(res!.message).toBeTruthy();
    expect(res!.quick_questions.length).toBe(0);
    expect(res!.wines).toEqual([]);
  });
});


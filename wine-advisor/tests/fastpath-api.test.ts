import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getQuestions } from "@/app/api/fastpath/questions/route";
import { POST as postAnswer } from "@/app/api/fastpath/answer/route";

describe("GET /api/fastpath/questions", () => {
  it("returns questions and max_initial_suggestions", async () => {
    const res = await getQuestions();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.questions).toBeDefined();
    expect(Array.isArray(data.questions)).toBe(true);
    expect(data.questions.length).toBeGreaterThan(0);
    expect(data.max_initial_suggestions).toBe(3);
    expect(data.questions[0]).toHaveProperty("id");
    expect(data.questions[0]).toHaveProperty("text_zh");
    expect(data.questions[0]).toHaveProperty("text_en");
  });
});

describe("POST /api/fastpath/answer", () => {
  it("returns message and quick_questions for valid question_id", async () => {
    const req = new NextRequest("http://localhost/api/fastpath/answer", {
      method: "POST",
      body: JSON.stringify({ question_id: "Q_A", language: "zh" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postAnswer(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBeTruthy();
    expect(data.quick_questions).toBeDefined();
    expect(data.quick_questions.length).toBe(3);
    expect(data.quick_questions[0]).toEqual({
      id: "Q_A_1",
      text: "你的预算大概是多少？",
    });
    expect(data.wines).toEqual([]);
  });

  it("returns 404 for invalid question_id", async () => {
    const req = new NextRequest("http://localhost/api/fastpath/answer", {
      method: "POST",
      body: JSON.stringify({ question_id: "NOT_EXIST", language: "zh" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postAnswer(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found|Question not found/i);
  });

  it("returns 400 when question_id is missing", async () => {
    const req = new NextRequest("http://localhost/api/fastpath/answer", {
      method: "POST",
      body: JSON.stringify({ language: "zh" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postAnswer(req);
    expect(res.status).toBe(400);
  });

  it("returns wine list and catalog_grouped for Q_D", async () => {
    const req = new NextRequest("http://localhost/api/fastpath/answer", {
      method: "POST",
      body: JSON.stringify({ question_id: "Q_D", language: "zh" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postAnswer(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toMatch(/款酒/);
    expect(data.wines.length).toBeGreaterThan(0);
    expect(data.catalog_grouped).toBeDefined();
    expect(data.catalog_grouped.red).toBeDefined();
    expect(data.catalog_grouped.white).toBeDefined();
  });

  it("returns wineries and per-winery follow-ups for Q_E", async () => {
    const req = new NextRequest("http://localhost/api/fastpath/answer", {
      method: "POST",
      body: JSON.stringify({ question_id: "Q_E", language: "zh" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postAnswer(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wineries).toBeDefined();
    expect(data.wineries.length).toBeGreaterThan(0);
    expect(data.quick_questions.some((q: { id: string }) => q.id.startsWith("Q_E_1_"))).toBe(true);
  });

  it("returns single winery intro for Q_E_1_CV", async () => {
    const req = new NextRequest("http://localhost/api/fastpath/answer", {
      method: "POST",
      body: JSON.stringify({ question_id: "Q_E_1_CV", language: "zh" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postAnswer(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wineries).toBeDefined();
    expect(data.wineries.length).toBe(1);
    expect(data.wineries[0].id).toBe("CV");
    expect(data.wineries[0].intro_zh).toBeDefined();
  });
});

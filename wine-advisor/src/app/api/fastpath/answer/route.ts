import { NextRequest, NextResponse } from "next/server";
import { getQuickQueryAnswer } from "@/lib/fastpath";

type Language = "zh" | "en";

/**
 * POST /api/fastpath/answer
 * 根据 question_id 与 language 返回固定答案与追问列表。
 * 请求体: { question_id: string, language?: "zh" | "en" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question_id =
      typeof body?.question_id === "string" ? body.question_id.trim() : "";
    const language: Language =
      body?.language === "en" || body?.language === "zh" ? body.language : "zh";

    if (!question_id) {
      return NextResponse.json(
        { error: "question_id is required" },
        { status: 400 }
      );
    }

    const result = getQuickQueryAnswer(question_id, language);
    if (result === null) {
      return NextResponse.json(
        { error: "Question not found", question_id },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: result.message,
      quick_questions: result.quick_questions,
      wines: result.wines,
      ...(result.catalog_grouped && { catalog_grouped: result.catalog_grouped }),
      ...(result.wineries && { wineries: result.wineries }),
    });
  } catch (err) {
    console.error("[fastpath/answer]", err);
    return NextResponse.json(
      { error: "Failed to get quick query answer" },
      { status: 500 }
    );
  }
}

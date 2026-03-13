import { NextResponse } from "next/server";
import { getQuickQueryQuestions } from "@/lib/fastpath";

/**
 * GET /api/fastpath/questions
 * 返回快速查询问题列表，供前端「快速查询」入口展示。
 */
export async function GET() {
  try {
    const data = getQuickQueryQuestions();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[fastpath/questions]", err);
    return NextResponse.json(
      { error: "Failed to load quick query questions" },
      { status: 500 }
    );
  }
}

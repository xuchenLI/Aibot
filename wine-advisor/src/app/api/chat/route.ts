// ============================================
// Chat API Route - 对话主入口
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import { runFastPath } from "@/lib/fastpath";
import { v4 as uuidv4 } from "uuid";
import type { ChatRequest, ChatResponse, SystemState } from "@/lib/types";

// 内存会话存储（后续会换数据库）
interface SessionData {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  states: SystemState[];
}

const sessions = new Map<string, SessionData>();

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, session_id } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // 获取或创建会话
    const sid = session_id || uuidv4();
    if (!sessions.has(sid)) {
      sessions.set(sid, { history: [], states: [] });
    }
    const session = sessions.get(sid)!;

    // 先尝试 Fast Path（阶段0默认：不确定则回 Full Path）
    const fastPath = runFastPath(message.trim(), session.history.length);
    if (fastPath.hit) {
      // 更新会话历史
      session.history.push({ role: "user", content: message.trim() });
      session.history.push({ role: "assistant", content: fastPath.message || "" });
      session.states.push(fastPath.state);

      if (session.history.length > 100) {
        session.history = session.history.slice(-100);
      }
      if (session.states.length > 100) {
        session.states = session.states.slice(-100);
      }

      const response: ChatResponse = {
        message: fastPath.message || "",
        session_id: sid,
        wines: fastPath.wines,
        quick_questions: fastPath.quick_questions,
        _debug: {
          state_decision: {
            state: fastPath.state,
            reasons: [fastPath.reason_code || "FASTPATH"],
            allowed_actions: ["answer"],
            forbidden: [],
          },
        },
      };
      return NextResponse.json(response);
    }

    // 执行完整管线：M1 → M2 → 匹配 → 生成
    const result = await runPipeline(message.trim(), session.history, session.states);

    // 更新会话历史
    session.history.push({ role: "user", content: message.trim() });
    session.history.push({ role: "assistant", content: result.reply });
    session.states.push(result._debug.state_decision.state);

    // 限制历史长度（保留最近 50 轮）
    if (session.history.length > 100) {
      session.history = session.history.slice(-100);
    }
    if (session.states.length > 100) {
      session.states = session.states.slice(-100);
    }

    const response: ChatResponse = {
      message: result.reply,
      session_id: sid,
      wines: result.wines,
      _debug: {
        canonical: result._debug.canonical,
        state_decision: result._debug.state_decision,
        guard_result: result._debug.guard_result,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Chat API error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("API_KEY") ||
      errorMessage.includes("api_key") ||
      errorMessage.includes("Incorrect API key")
    ) {
      return NextResponse.json(
        {
          error: "API key not configured",
          message:
            "API Key 未配置或无效。请在 .env.local 文件中设置 OPENAI_API_KEY。\nAPI Key is not configured. Please set OPENAI_API_KEY in .env.local.",
          session_id: "",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          "抱歉，系统遇到了问题，请稍后再试。\nSorry, the system encountered an issue. Please try again later.",
        session_id: "",
      },
      { status: 500 }
    );
  }
}

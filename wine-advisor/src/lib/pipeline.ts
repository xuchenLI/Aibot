// ============================================
// 对话管线（Pipeline）- 串联 M1 → M2 → 生成
// ============================================
// 完整处理流程：
// 1. M1: 用户输入 → 结构化 JSON (CanonicalParse)
// 2. M2: 结构化 JSON → 状态裁决 (StateDecision)
// 3. 产品匹配: 状态为 S_RECOMMEND 时匹配候选酒
// 4. 受控生成: 根据状态 + 候选酒，让 LLM 生成受控回复
// 5. Output Guard: 最终安全校验
// ============================================

import { parseUserMessage } from "@/lib/parser";
import { evaluatePolicy } from "@/lib/policy";
import { chatCompletion } from "@/lib/llm";
import { runGuard, type GuardCheckResult } from "@/lib/guard";
import { getTopRecommendations, type WineProduct } from "@/data/products";
import type { CanonicalParse, StateDecision, SystemState, WineCandidate } from "@/lib/types";

// ============================================
// 各状态的生成 Prompt
// ============================================

function buildSystemPrompt(
  state: StateDecision,
  candidates?: Array<WineProduct & { _score: number }>
): string {
  const basePrompt = `You are a professional wine advisor for a wine company, helping liquor store owners find wines from our product catalog.
Respond in the same language the user uses (English or Chinese).
Be professional, concise, and helpful.`;

  switch (state.state) {
    case "S_RECOMMEND": {
      const wineList = candidates?.map((w, i) => 
        `${i + 1}. ${w.name} (${w.name_cn}) — SKU: ${w.sku}
   Color: ${w.color} | Region: ${w.region} | Grape: ${w.grape_variety}
   Body: ${w.body} | Tannin: ${w.tannin || 'N/A'} | Acid: ${w.acid} | Sweetness: ${w.sweetness}
   Price: $${w.price} | Alcohol: ${w.alcohol}
   Flavor: ${w.flavor_profile}
   Food pairing: ${w.food_pairing}
   Tasting notes: ${w.tasting_notes}`
      ).join("\n\n") || "No wines matched.";

      // OPT-1: 部分拒绝时追加禁令
      let partialRefuseBlock = "";
      if (state.partial_refuse) {
        const forbiddenTopics = state.partial_refuse.forbidden_topics.join(", ");
        const sourceTexts = state.partial_refuse.refused_flags
          .filter((rf) => rf.source_text)
          .map((rf) => `"${rf.source_text}"`)
          .join(", ");
        partialRefuseBlock = `

## IMPORTANT — Partial restriction:
The user's message contained a problematic part (${sourceTexts || "flagged content"}) that you MUST NOT address.
DO NOT discuss: ${forbiddenTopics}.
Instead: briefly and warmly acknowledge you can't help with that aspect (1 sentence max), then IMMEDIATELY focus on the valid recommendation based on their other preferences.
Do NOT apologize excessively or dwell on the restriction. Keep the focus on helpful recommendations.`;
      }

      return `${basePrompt}

## Your task: RECOMMEND wines
The system has selected these candidate wines based on the user's preferences. Present them to the user with clear reasoning.

## Candidate wines:
${wineList}
${partialRefuseBlock}

## Rules:
- Present these specific wines with their SKU numbers
- Explain WHY each wine matches the user's needs
- You may compare candidates on objective parameters (flavor, tannin, body, price)
- Include the SKU number for each wine
- You CAN say which wine is the best fit for their specific needs and why
- You CAN rank or prioritize wines based on how well they match the user's request
- If only 1 wine matched, confidently recommend it and mention our catalog has other options
- NEVER mention wines that are not in the candidate list above
- NEVER encourage excessive drinking
- Keep the response concise and practical`;
    }

    case "S_CLARIFY": {
      const missing = state.required_slots_missing?.length
        ? `Missing information: ${state.required_slots_missing.join(", ")}`
        : "";
      const conflicts = state.conflict_summary
        ? `Detected conflicts: ${state.conflict_summary}`
        : "";

      return `${basePrompt}

## Your task: CLARIFY the user's needs
The user wants wine recommendations but we need more information.

${missing}
${conflicts}

## Rules:
- First, acknowledge what you DO understand from their message
- Then ask 1-2 specific questions to narrow down their needs
- Explain WHY you're asking (so you can give them the BEST recommendation)
- You may give directional guidance (e.g., "based on what you've told me, we'd likely be looking at red wines in the medium-body range")
- Frame it positively: "Let me understand your needs better so I can find the perfect wines for you"
- NEVER say "I can't recommend" or "I'm not able to suggest" — instead say "I want to make sure I recommend the right wines"
- Do NOT ask more than 2 questions at once
- Keep it conversational, not like a form`;
    }

    case "S_ANSWER": {
      return `${basePrompt}

## Your task: ANSWER a wine knowledge question
The user is asking about wine in general (not requesting a specific recommendation).

## Rules:
- Provide accurate, helpful wine knowledge
- You may reference wines from our catalog if they are relevant examples (e.g., "Our Highland Pinot Noir is a great example of this style")
- Keep the answer focused and educational
- Naturally connect knowledge to our products when relevant
- Proactively offer: "Would you like me to recommend some wines based on this?" or "I can find specific options from our catalog if you're interested"`;
    }

    case "S_REFUSE": {
      const reason = state.reasons[0] || "OUT_OF_SCOPE";
      
      let refuseGuidance = "";
      switch (reason) {
        case "RULE_REFUSE_OUT_OF_SCOPE":
          refuseGuidance = "The user asked about something outside wine selection. Politely redirect to wine topics.";
          break;
        case "RULE_REFUSE_EXTERNAL_COMPARISON":
          refuseGuidance = "The user wants to compare our wines with competitor brands. Explain we can only discuss our own catalog.";
          break;
        case "RULE_REFUSE_ENCOURAGE_DRINKING":
          refuseGuidance = "The user's message involves encouraging drinking. Politely decline.";
          break;
        case "RULE_REFUSE_MINOR_RELATED":
          refuseGuidance = "The user's message involves minors. Firmly but politely decline.";
          break;
        case "RULE_REFUSE_HEALTH_CLAIM":
          refuseGuidance = "The user asks about health benefits of wine. Explain you cannot provide health advice.";
          break;
        case "RULE_REFUSE_CLARIFY_DEADLOCK":
          refuseGuidance = "We've asked for clarification multiple times without progress. Suggest the user contact our sales team directly for personalized help.";
          break;
        default:
          refuseGuidance = "The request is outside our service scope.";
      }

      return `${basePrompt}

## Your task: POLITELY DECLINE and redirect
${refuseGuidance}

## Rules:
- Be warm and respectful, never cold or robotic
- Clearly explain what you CAN help with
- Suggest an alternative path (e.g., "I can help you explore wines by flavor profile, price range, or food pairing")
- Do NOT recommend specific wines
- Do NOT apologize excessively — be confident and helpful
- Keep it brief`;
    }

    default:
      return basePrompt;
  }
}

// ============================================
// 管线主函数
// ============================================

export interface PipelineResult {
  reply: string;
  wines?: WineCandidate[];
  _debug: {
    canonical: CanonicalParse;
    state_decision: StateDecision;
    guard_result: GuardCheckResult;
    matched_wines?: number;
  };
}

/**
 * 执行完整对话管线
 */
export async function runPipeline(
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>,
  historyStates: SystemState[] = []
): Promise<PipelineResult> {
  // ---- Step 1: M1 语义解析 ----
  console.log("[Pipeline] Step 1: M1 parsing...");
  const canonical = await parseUserMessage(userMessage);
  console.log("[Pipeline] M1 result:", JSON.stringify(canonical, null, 2));

  // ---- Step 2: M2 规则引擎 ----
  console.log("[Pipeline] Step 2: M2 policy evaluation...");
  const stateDecision = evaluatePolicy(canonical, historyStates);
  console.log("[Pipeline] M2 result:", stateDecision.state, "reasons:", stateDecision.reasons);

  // ---- Step 3: 产品匹配（仅 S_RECOMMEND）----
  let candidates: Array<WineProduct & { _score: number }> = [];
  let wineCards: WineCandidate[] | undefined;

  if (stateDecision.state === "S_RECOMMEND") {
    console.log("[Pipeline] Step 3: Product matching...");
    candidates = getTopRecommendations(canonical.entities as Record<string, unknown>, 3);
    console.log("[Pipeline] Matched wines:", candidates.length);

    // 如果没有匹配的酒，降级为澄清
    if (candidates.length === 0) {
      console.log("[Pipeline] No matches — downgrading to S_CLARIFY");
      stateDecision.state = "S_CLARIFY";
      stateDecision.reasons.push("NO_PRODUCT_MATCH");
      stateDecision.allowed_actions = ["confirm_understanding", "ask_clarification", "explain_direction"];
      stateDecision.forbidden = ["recommend_wine", "output_sku"];
    } else {
      // 构建前端酒款卡片数据
      wineCards = candidates.map((w) => ({
        id: w.id,
        name: w.name,
        name_cn: w.name_cn,
        sku: w.sku,
        color: w.color,
        region: w.region,
        grape_variety: w.grape_variety,
        tasting_notes: w.tasting_notes,
        price: w.price,
        _score: w._score,
      }));
    }
  }

  // ---- Step 4: 受控生成 ----
  console.log("[Pipeline] Step 4: Controlled generation (state:", stateDecision.state, ")");
  const systemPrompt = buildSystemPrompt(stateDecision, candidates);
  const draftReply = await chatCompletion(chatHistory, userMessage, systemPrompt);

  // ---- Step 5: Output Guard ----
  console.log("[Pipeline] Step 5: Output Guard...");
  const guardResult = runGuard(draftReply, stateDecision);
  console.log("[Pipeline] Guard result:", guardResult.decision, 
    guardResult.reason_codes.length > 0 ? `reasons: ${guardResult.reason_codes.join(", ")}` : "(clean)");

  // 如果被拦截，不返回酒款卡片
  const finalWines = guardResult.decision === "BLOCK" ? undefined : wineCards;

  return {
    reply: guardResult.final_text,
    wines: finalWines,
    _debug: {
      canonical,
      state_decision: stateDecision,
      guard_result: guardResult,
      matched_wines: candidates.length,
    },
  };
}

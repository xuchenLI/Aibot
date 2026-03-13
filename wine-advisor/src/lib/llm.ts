// ============================================
// LLM 客户端 - 统一接口（支持 OpenAI / Mock）
// ============================================
// 当前使用 OpenAI GPT-4o-mini
// 架构上可随时切换为 Gemini 或其他模型
// ============================================

import OpenAI from "openai";

// ============================================
// 模式检测
// ============================================

function isMockMode(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !key || key === "mock" || key === "your_openai_api_key_here";
}

// ============================================
// OpenAI 客户端
// ============================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "mock") {
      throw new Error("Mock mode - no real API client");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ============================================
// Mock 响应逻辑（开发/测试用）
// ============================================

const MOCK_RESPONSES: Record<string, string> = {
  recommend: `Based on your preferences, here are two wines from our catalog that I'd recommend:

**1. Okanagan Reserve Merlot** (SKU: WR-001)
- *Region:* Okanagan Valley, BC
- *Profile:* Medium body, soft tannin, moderate acidity
- *Tasting Notes:* Ripe cherry and plum flavors with a hint of vanilla and oak
- *Price:* $28.99
- *Best for:* Customers who prefer smooth, approachable reds

**2. Fraser Valley Pinot Noir** (SKU: WR-005)
- *Region:* Fraser Valley, BC
- *Profile:* Light-medium body, soft tannin, bright acidity
- *Tasting Notes:* Strawberry, raspberry with earthy undertones
- *Price:* $32.99
- *Best for:* Customers looking for elegant, food-friendly reds

Both are great options for customers who want smooth, easy-drinking reds. The Merlot is more fruit-forward, while the Pinot Noir offers more complexity. Would you like more details on either wine?`,

  info: `Great question! Here's a quick overview:

**Tannin** is a naturally occurring compound found in grape skins, seeds, and stems. It creates that dry, slightly bitter sensation in your mouth when you drink red wine.

- **Strong tannin:** Bold, structured wines like Cabernet Sauvignon — creates a firm, mouth-drying sensation
- **Medium tannin:** Balanced wines like Merlot or Sangiovese — noticeable but smooth
- **Soft tannin:** Gentle wines like Pinot Noir — silky, easy-drinking

For your liquor store customers, tannin level is one of the most important factors in wine selection. Customers who are new to red wine generally prefer soft tannin wines.

Would you like me to recommend some specific wines from our catalog based on tannin levels?`,

  clarify: `I'd love to help you find the right wines! To give you the best recommendations, let me understand your needs a bit better:

1. **What's the typical price range** your customers look for? (e.g., $15-25, $25-40, $40+)
2. **What's the occasion?** Are these for everyday drinking, special occasions, or gifts?
3. **Any flavor preferences?** For example, do your customers generally prefer fruity and smooth, or bold and structured?

This will help me narrow down the best matches from our catalog.`,

  refuse: `I appreciate the question, but that's a bit outside what I can help with. I'm specifically designed to help you find wines from **our product catalog**.

Here's what I *can* do for you:
- Recommend wines based on your customers' preferences
- Compare wines in our catalog (flavor, body, tannin, price, etc.)
- Explain wine characteristics and pairing suggestions
- Provide SKU numbers for ordering

Would you like to explore any of these? Just tell me what your customers are looking for!`,

  default: `Thanks for reaching out! I'm here to help you find the perfect wines from our catalog for your store.

I can help you with:
- **Wine recommendations** based on your customers' preferences (flavor, price, occasion)
- **Product comparisons** — side-by-side comparison of wines in our catalog
- **Wine knowledge** — grape varieties, regions, tasting notes explained
- **SKU lookup** — find the right products for your orders

What are you looking for today?`,
};

function getMockResponse(message: string): string {
  const lower = message.toLowerCase();

  // 优先级 1000：拒绝类
  if (
    lower.includes("weather") || lower.includes("politics") ||
    lower.includes("stock") || lower.includes("competitor") ||
    lower.includes("天气") || lower.includes("政治") ||
    lower.includes("其他品牌") || lower.includes("比较其他")
  ) return MOCK_RESPONSES.refuse;

  // 优先级 500：推荐类
  if (
    lower.includes("recommend") || lower.includes("suggest") ||
    lower.includes("looking for") || lower.includes("推荐") ||
    lower.includes("有什么酒") || lower.includes("适合") ||
    lower.includes("want a") || lower.includes("need a") ||
    lower.includes("find me") || lower.includes("我想找") ||
    lower.includes("帮我选") || lower.includes("哪款")
  ) return MOCK_RESPONSES.recommend;

  // 优先级 300：信息类
  if (
    lower.includes("what is") || lower.includes("what are") ||
    lower.includes("how do") || lower.includes("explain") ||
    lower.includes("tell me about") || lower.includes("什么是") ||
    lower.includes("区别") || lower.includes("tannin") ||
    lower.includes("acidity") || lower.includes("怎么") ||
    lower.includes("介绍")
  ) return MOCK_RESPONSES.info;

  // 优先级 200：模糊/澄清类
  if (
    lower.includes("wine") || lower.includes("红酒") ||
    lower.includes("白葡萄酒") || lower.includes("good") ||
    lower.includes("nice") || lower.includes("好喝") ||
    lower.includes("酒")
  ) return MOCK_RESPONSES.clarify;

  return MOCK_RESPONSES.default;
}

// ============================================
// 公共 API - 统一接口
// ============================================

/**
 * 多轮对话（主要入口）
 */
export async function chatCompletion(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  newMessage: string,
  systemPrompt?: string
): Promise<string> {
  if (isMockMode()) {
    return getMockResponse(newMessage);
  }

  const client = getOpenAIClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  // System prompt
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // History
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // New user message
  messages.push({ role: "user", content: newMessage });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 1500,
  });

  return response.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
}

/**
 * 单次生成文本
 */
export async function generateText(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  return chatCompletion([], prompt, systemPrompt);
}

/**
 * 生成并解析为 JSON
 */
export async function generateJSON<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T> {
  if (isMockMode()) {
    // OPT-1: risk_flags 使用新的对象格式
    return {
      intent: "recommend_wine",
      entities: {},
      risk_flags: [],
      need_clarify: false,
      missing_slots: [],
      conflicts: [],
    } as T;
  }

  const client = getOpenAIClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "{}";

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("Failed to parse LLM JSON response:", text);
    throw new Error("LLM returned invalid JSON");
  }
}

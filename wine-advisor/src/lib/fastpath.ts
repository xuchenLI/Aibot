import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { runGuard } from "@/lib/guard";
import { WINE_PRODUCTS, WINERIES } from "@/data/products";
import type {
  CatalogGrouped,
  CatalogGroupedSection,
  QuickQuestion,
  StateDecision,
  SystemState,
  WineCandidate,
  WineryDisplay,
} from "@/lib/types";

type Language = "zh" | "en";

interface GreetingTemplate {
  id: string;
  language: Language;
  triggers: string[];
  response: string;
}

interface ToolQA {
  id: string;
  language: Language;
  question_patterns: string[];
  answer: string;
}

interface BasicQA {
  id: string;
  language: Language;
  question_patterns: string[];
  answer: string;
}

interface ChoiceQuestion {
  id: string;
  text_zh: string;
  text_en: string;
}

interface InitialQuestion extends ChoiceQuestion {
  answer_type: "static" | "wine_catalog_list" | "winery_list";
  answer_zh?: string;
  answer_en?: string;
  follow_up_ids?: string[];
}

interface DialogBank {
  default_language_policy: "follow_user_language";
  max_initial_suggestions: number;
  greeting_templates: GreetingTemplate[];
  tool_usage_qa: ToolQA[];
  wine_basic_qa: BasicQA[];
  choice_question_bank: {
    initial_questions: InitialQuestion[];
    follow_up_questions: ChoiceQuestion[];
  };
}

interface LookupRules {
  matching_policy: {
    priority_order: string[];
    fuzzy_threshold: number;
    normalize_rules: string[];
  };
  sku_patterns: string[];
  alias_dictionary: Array<{
    canonical_name: string;
    aliases: string[];
  }>;
  fallback_behavior: {
    on_no_match: "fallback_to_fullpath";
    on_multi_match: "ask_clarification";
    clarification_prompt_zh: string;
    clarification_prompt_en: string;
  };
}

export interface FastPathResult {
  hit: boolean;
  reason_code?: string;
  message?: string;
  wines?: WineCandidate[];
  quick_questions?: QuickQuestion[];
  state: SystemState;
}

const FASTPATH_DIR = path.resolve(
  process.cwd(),
  "..",
  "00_docs",
  "docs_md",
  "spec",
  "fastpath"
);

function readYaml<T>(filename: string): T {
  const fullPath = path.join(FASTPATH_DIR, filename);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return yaml.load(raw) as T;
}

function detectLanguage(text: string): Language {
  return /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[.,!?;:，。！？；：]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function findInitialQuestion(
  userText: string,
  lang: Language,
  dialogBank: DialogBank
): InitialQuestion | null {
  const norm = normalize(userText);
  return (
    dialogBank.choice_question_bank.initial_questions.find((q) => {
      const text = lang === "zh" ? q.text_zh : q.text_en;
      return normalize(text) === norm;
    }) ?? null
  );
}

function findFollowUpQuestion(
  userText: string,
  lang: Language,
  dialogBank: DialogBank
): ChoiceQuestion | null {
  const norm = normalize(userText);
  return (
    dialogBank.choice_question_bank.follow_up_questions.find((q) => {
      const text = lang === "zh" ? q.text_zh : q.text_en;
      return normalize(text) === norm;
    }) ?? null
  );
}

function buildCatalogMessage(
  lang: Language,
  wines: WineCandidate[]
): string {
  const deduped = Array.from(new Map(wines.map((w) => [w.sku, w])).values());
  const list = deduped.map((w) => `• ${w.name}（${w.sku}）`).join("\n");
  return lang === "zh"
    ? `我们目前共有 ${deduped.length} 款酒：\n${list}\n\n你可以直接告诉我酒名或 SKU，或者描述你的需求，我来帮你匹配。`
    : `We currently have ${deduped.length} wines:\n${list}\n\nYou can name a wine or SKU directly, or describe what you need and I will help match.`;
}

/** 按红/白分类，再按葡萄品种细分，用于「你们有哪些酒」的结构化展示 */
function buildCatalogGrouped(lang: Language, cards: WineCandidate[]): CatalogGrouped {
  const deduped = Array.from(new Map(cards.map((w) => [w.sku, w])).values());
  const byColor = {
    red: deduped.filter((w) => w.color === "red"),
    white: deduped.filter((w) => w.color === "white"),
    rose: deduped.filter((w) => w.color === "rose"),
    sparkling: deduped.filter((w) => w.color === "sparkling"),
  };

  function groupByVariety(wines: WineCandidate[]): CatalogGroupedSection[] {
    const map = new Map<string, WineCandidate[]>();
    for (const w of wines) {
      const v = (w.grape_variety || "").trim() || (lang === "zh" ? "其他" : "Other");
      if (!map.has(v)) map.set(v, []);
      map.get(v)!.push(w);
    }
    return Array.from(map.entries()).map(([variety, list]) => ({ variety, wines: list }));
  }

  return {
    red: groupByVariety(byColor.red),
    white: groupByVariety(byColor.white),
    ...(byColor.rose.length > 0 ? { rose: groupByVariety(byColor.rose) } : {}),
    ...(byColor.sparkling.length > 0 ? { sparkling: groupByVariety(byColor.sparkling) } : {}),
  };
}

/** 「你们有哪些酒」的简短引导文案（具体列表由前端按 catalog_grouped 渲染） */
function buildCatalogIntroMessage(lang: Language, totalCount: number): string {
  return lang === "zh"
    ? `我们目前共有 **${totalCount}** 款酒，按红/白分类、再按葡萄品种整理如下。你可以直接告诉我酒名或 SKU，或描述需求，我来帮你匹配。`
    : `We currently have **${totalCount}** wines, grouped by color (red / white) and grape variety below. You can name a wine or SKU, or describe what you need and I will help match.`;
}

function toQuickQuestions(
  qs: ChoiceQuestion[] | undefined,
  lang: Language,
  max: number
): QuickQuestion[] {
  if (!qs || qs.length === 0) return [];
  return qs.slice(0, max).map((q) => ({
    id: q.id,
    text: lang === "zh" ? q.text_zh : q.text_en,
  }));
}

function resolveFollowUps(
  ids: string[] | undefined,
  dialogBank: DialogBank,
  lang: Language,
  max: number
): QuickQuestion[] {
  if (!ids || ids.length === 0) return [];
  const pool = dialogBank.choice_question_bank.follow_up_questions;
  const matched = ids
    .map((id) => pool.find((q) => q.id === id))
    .filter((q): q is ChoiceQuestion => q !== undefined);
  return toQuickQuestions(matched, lang, max);
}

function buildWineCard(p: {
  id: string;
  name: string;
  name_cn?: string;
  sku: string;
  color: string;
  region: string;
  grape_variety: string;
  price: number;
  tasting_notes: string;
  video_url?: string;
  video_title?: string;
}): WineCandidate {
  return {
    id: p.id,
    name: p.name,
    name_cn: p.name_cn,
    sku: p.sku,
    color: p.color,
    region: p.region,
    grape_variety: p.grape_variety,
    tasting_notes: p.tasting_notes,
    price: p.price,
    video_url: p.video_url,
    video_title: p.video_title,
  };
}

function mkState(reason: string): StateDecision {
  return {
    state: "S_ANSWER",
    reasons: [reason],
    allowed_actions: ["explain_knowledge", "guide_next_step"],
    forbidden: ["encourage_consumption"],
  };
}

function guardText(text: string, reason: string): string {
  const res = runGuard(text, mkState(reason));
  return res.final_text;
}

export function runFastPath(
  userMessage: string,
  historyLength: number
): FastPathResult {
  const dialog = readYaml<DialogBank>("dialog_qa_bank.yaml");
  const rules = readYaml<LookupRules>("wine_lookup_rules.yaml");
  const lang = detectLanguage(userMessage);
  const norm = normalize(userMessage);

  const maxSuggestions = dialog.max_initial_suggestions ?? 3;

  // 1) Greeting
  for (const g of dialog.greeting_templates) {
    if (g.language !== lang) continue;
    const hit = g.triggers.some((t) => norm.includes(normalize(t)));
    if (hit) {
      const msg = guardText(g.response, g.id);
      const quick = historyLength === 0
        ? toQuickQuestions(dialog.choice_question_bank.initial_questions, lang, maxSuggestions)
        : [];
      return {
        hit: true,
        reason_code: "FASTPATH_GREETING",
        message: msg,
        quick_questions: quick,
        state: "S_ANSWER",
      };
    }
  }

  // 2) Tool usage Q&A
  for (const qa of dialog.tool_usage_qa) {
    if (qa.language !== lang) continue;
    const hit = qa.question_patterns.some((p) => norm.includes(normalize(p)));
    if (hit) {
      const msg = guardText(qa.answer, qa.id);
      return {
        hit: true,
        reason_code: "FASTPATH_TOOL_QA",
        message: msg,
        state: "S_ANSWER",
      };
    }
  }

  // 3) Wine basic Q&A
  for (const qa of dialog.wine_basic_qa) {
    if (qa.language !== lang) continue;
    const hit = qa.question_patterns.some((p) => norm.includes(normalize(p)));
    if (hit) {
      const msg = guardText(qa.answer, qa.id);
      return {
        hit: true,
        reason_code: "FASTPATH_BASIC_QA",
        message: msg,
        state: "S_ANSWER",
      };
    }
  }

  // 4) Choice questions — initial questions (with fixed answer)
  const pickedInitial = findInitialQuestion(userMessage, lang, dialog);
  if (pickedInitial) {
    let msg: string;
    if (pickedInitial.answer_type === "wine_catalog_list") {
      const cards = WINE_PRODUCTS.map((p) => buildWineCard(p));
      msg = buildCatalogMessage(lang, cards);
    } else {
      const raw = lang === "zh"
        ? (pickedInitial.answer_zh ?? pickedInitial.text_zh)
        : (pickedInitial.answer_en ?? pickedInitial.text_en);
      msg = guardText(raw, pickedInitial.id);
    }
    const quick = resolveFollowUps(pickedInitial.follow_up_ids, dialog, lang, maxSuggestions);
    return {
      hit: true,
      reason_code: "FASTPATH_CHOICE_QA",
      message: msg,
      quick_questions: quick,
      state: "S_ANSWER",
    };
  }

  // 4b) Follow-up questions (no fixed answer — fallback to fullpath for actual recommendation)
  const pickedFollowUp = findFollowUpQuestion(userMessage, lang, dialog);
  if (pickedFollowUp) {
    const ack = lang === "zh"
      ? `已收到：${pickedFollowUp.text_zh}。让我根据这个为你进一步筛选。`
      : `Got it: ${pickedFollowUp.text_en}. Let me narrow down further based on that.`;
    return {
      hit: true,
      reason_code: "FASTPATH_FOLLOWUP_QA",
      message: guardText(ack, pickedFollowUp.id),
      state: "S_ANSWER",
    };
  }

  // 5) Wine lookup by SKU/Name/Alias/Fuzzy (strict fallback default)
  const skuRegexes = rules.sku_patterns.map((p) => new RegExp(p, "i"));
  const isLikelySku = skuRegexes.some((r) => r.test(userMessage.trim()));

  const candidates: Array<{ name: string; sku: string; card: WineCandidate; score: number }> = [];

  // catalog cards
  for (const p of WINE_PRODUCTS) {
    candidates.push({
      name: p.name,
      sku: p.sku,
      card: buildWineCard(p),
      score: 0,
    });
  }

  // exact sku / exact name / alias / fuzzy
  const aliasMap = new Map<string, string>();
  for (const item of rules.alias_dictionary) {
    aliasMap.set(normalize(item.canonical_name), item.canonical_name);
    for (const alias of item.aliases) aliasMap.set(normalize(alias), item.canonical_name);
  }

  const normMsg = normalize(userMessage);
  let matched: typeof candidates = [];

  // exact sku
  matched = candidates.filter((c) => normalize(c.sku) === normMsg);

  // exact name
  if (matched.length === 0) {
    matched = candidates.filter((c) => normalize(c.name) === normMsg);
  }

  // alias
  if (matched.length === 0) {
    const canonical = aliasMap.get(normMsg);
    if (canonical) {
      matched = candidates.filter((c) => normalize(c.name) === normalize(canonical));
    }
  }

  // fuzzy name
  if (matched.length === 0 && !isLikelySku) {
    const threshold = rules.matching_policy.fuzzy_threshold ?? 0.82;
    const scored = candidates
      .map((c) => ({ ...c, score: similarity(normMsg, normalize(c.name)) }))
      .filter((c) => c.score >= threshold)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
      const topScore = scored[0].score;
      matched = scored.filter((s) => Math.abs(s.score - topScore) < 0.03);
    }
  }

  if (matched.length === 1) {
    const wine = matched[0].card;
    const text = lang === "zh"
      ? `我找到了这款酒：${wine.name}（${wine.sku}）。下面是它的简介。`
      : `I found this wine: ${wine.name} (${wine.sku}). Here is a quick introduction.`;
    return {
      hit: true,
      reason_code: "FASTPATH_WINE_LOOKUP_SINGLE",
      message: guardText(text, "WINE_LOOKUP"),
      wines: [wine],
      state: "S_ANSWER",
    };
  }

  if (matched.length > 1) {
    const m = lang === "zh"
      ? rules.fallback_behavior.clarification_prompt_zh
      : rules.fallback_behavior.clarification_prompt_en;
    return {
      hit: true,
      reason_code: "FASTPATH_WINE_LOOKUP_MULTI",
      message: guardText(m, "WINE_LOOKUP_MULTI"),
      wines: matched.slice(0, 3).map((x) => x.card),
      state: "S_CLARIFY",
    };
  }

  // Strict default: unknown -> FULLPATH
  return {
    hit: false,
    reason_code: "FASTPATH_FALLBACK_FULLPATH",
    state: "S_ANSWER",
  };
}

// ============================================
// 快速查询（Quick Query）— 仅按 question_id 返回
// ============================================

export interface QuickQueryQuestion {
  id: string;
  text_zh: string;
  text_en: string;
}

export interface QuickQueryQuestionsResponse {
  questions: QuickQueryQuestion[];
  max_initial_suggestions: number;
}

export interface QuickQueryAnswerResponse {
  message: string;
  quick_questions: QuickQuestion[];
  wines: WineCandidate[];
  catalog_grouped?: CatalogGrouped;
  wineries?: WineryDisplay[];
}

/**
 * 获取快速查询问题列表（供 GET /api/fastpath/questions）
 */
export function getQuickQueryQuestions(): QuickQueryQuestionsResponse {
  const dialog = readYaml<DialogBank>("dialog_qa_bank.yaml");
  const questions: QuickQueryQuestion[] = dialog.choice_question_bank.initial_questions.map((q) => ({
    id: q.id,
    text_zh: q.text_zh,
    text_en: q.text_en,
  }));
  return {
    questions,
    max_initial_suggestions: dialog.max_initial_suggestions ?? 3,
  };
}

/** 将酒庄列表转为 WineryDisplay（可只带 intro 或 selling_points） */
function toWineryDisplays(
  lang: Language,
  opts: { intro?: boolean; sellingPoints?: boolean }
): WineryDisplay[] {
  return WINERIES.map((w) => ({
    id: w.id,
    name_zh: w.name_zh,
    name_en: w.name_en,
    ...(opts.intro && { intro_zh: w.intro_zh, intro_en: w.intro_en }),
    ...(opts.sellingPoints && {
      selling_points_zh: w.selling_points_zh,
      selling_points_en: w.selling_points_en,
    }),
  }));
}

/**
 * 根据 question_id 与 language 返回答案与追问（供 POST /api/fastpath/answer）
 * 支持 initial_questions 及部分 follow_up（如 Q_E_1 酒庄介绍、Q_E_2 酒庄卖点）。
 */
export function getQuickQueryAnswer(
  questionId: string,
  language: Language
): QuickQueryAnswerResponse | null {
  const dialog = readYaml<DialogBank>("dialog_qa_bank.yaml");
  const maxSuggestions = dialog.max_initial_suggestions ?? 3;

  // 按酒庄的追问：Q_E_1_<wineryId> = 该酒庄介绍，Q_E_2_<wineryId> = 该酒庄卖点
  const wineryFollowMatch = /^Q_E_(1|2)_(.+)$/.exec(questionId);
  if (wineryFollowMatch) {
    const [, type, wineryId] = wineryFollowMatch;
    const winery = WINERIES.find((w) => w.id === wineryId);
    if (!winery) return null;
    const intro = type === "1";
    const single: WineryDisplay = {
      id: winery.id,
      name_zh: winery.name_zh,
      name_en: winery.name_en,
      ...(intro && { intro_zh: winery.intro_zh, intro_en: winery.intro_en }),
      ...(!intro && {
        selling_points_zh: winery.selling_points_zh,
        selling_points_en: winery.selling_points_en,
      }),
    };
    const name = language === "zh" ? winery.name_zh : winery.name_en;
    const message =
      language === "zh"
        ? intro
          ? `以下是「${name}」的酒庄介绍：`
          : `以下是「${name}」的酒庄卖点：`
        : intro
          ? `Here is the introduction for ${name}:`
          : `Here are the selling points for ${name}:`;
    return { message, quick_questions: [], wines: [], wineries: [single] };
  }

  const initial = dialog.choice_question_bank.initial_questions.find((q) => q.id === questionId);
  if (!initial) return null;

  let message: string;
  let wines: WineCandidate[] = [];
  let catalog_grouped: CatalogGrouped | undefined;
  let wineries: WineryDisplay[] | undefined;
  let quick_questions: QuickQuestion[] = resolveFollowUps(
    initial.follow_up_ids,
    dialog,
    language,
    maxSuggestions
  );

  if (initial.answer_type === "wine_catalog_list") {
    const cards = WINE_PRODUCTS.map((p) => buildWineCard(p));
    catalog_grouped = buildCatalogGrouped(language, cards);
    message = buildCatalogIntroMessage(language, cards.length);
    wines = cards;
  } else if (initial.answer_type === "winery_list") {
    wineries = toWineryDisplays(language, {});
    message =
      language === "zh"
        ? "我们代理的酒庄如下，可点击某一酒庄的「酒庄介绍」或「酒庄卖点」查看详情。"
        : "Here are the wineries we represent. Click a winery's introduction or selling points to view.";
  } else {
    const raw =
      language === "zh"
        ? (initial.answer_zh ?? initial.text_zh)
        : (initial.answer_en ?? initial.text_en);
    message = guardText(raw, initial.id);
  }

  if (initial.answer_type === "winery_list") {
    quick_questions = WINERIES.flatMap((w) => [
      { id: `Q_E_1_${w.id}`, text: language === "zh" ? `${w.name_zh} 酒庄介绍` : `${w.name_en} introduction` },
      { id: `Q_E_2_${w.id}`, text: language === "zh" ? `${w.name_zh} 酒庄卖点` : `${w.name_en} selling points` },
    ]);
  }

  return {
    message,
    quick_questions,
    wines,
    ...(catalog_grouped && { catalog_grouped }),
    ...(wineries && { wineries }),
  };
}


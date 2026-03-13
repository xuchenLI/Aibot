"use client";

import type {
  CatalogGrouped,
  ChatMessage,
  WineCandidate,
  WineryDisplay,
} from "@/lib/types";
import ReactMarkdown from "react-markdown";
import { DebugPanel } from "./DebugPanel";
import { useMemo, useState } from "react";

interface Props {
  message: ChatMessage;
  showDebug?: boolean;
  /** 点击追问时传入整条问题（含 id），便于按 id 走快速查询（如 Q_E_1/Q_E_2） */
  onQuickQuestionSelect?: (question: { id: string; text: string }) => void;
}

const COLOR_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  red: { bg: "bg-red-50", text: "text-red-700", label: "Red" },
  white: { bg: "bg-amber-50", text: "text-amber-700", label: "White" },
  rose: { bg: "bg-pink-50", text: "text-pink-700", label: "Rosé" },
  sparkling: { bg: "bg-sky-50", text: "text-sky-700", label: "Sparkling" },
};

function WineCard({ wine }: { wine: WineCandidate }) {
  const [showVideo, setShowVideo] = useState(false);
  const embedUrl = useMemo(() => {
    if (!wine.video_url) return null;
    const url = wine.video_url;
    if (url.includes("youtube.com/watch?v=")) {
      const id = url.split("v=")[1]?.split("&")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  }, [wine.video_url]);

  const colorBadge = COLOR_BADGES[wine.color] || COLOR_BADGES.red;

  return (
    <div className="wine-card bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{wine.name}</p>
          {wine.name_cn && <p className="text-[11px] text-wine-600 mt-0.5">{wine.name_cn}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${colorBadge.bg} ${colorBadge.text}`}>
            {colorBadge.label}
          </span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-mono">{wine.sku}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-gray-400">
          <path fillRule="evenodd" d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.292 5.597a15.591 15.591 0 0 0 2.046 2.082 8.916 8.916 0 0 0 .189.153l.012.01ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
        </svg>
        <span>{wine.region}</span>
        <span className="text-gray-300">|</span>
        <span>{wine.grape_variety}</span>
      </div>
      {wine.tasting_notes && (
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{wine.tasting_notes}</p>
      )}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50">
        <span className="text-sm font-semibold text-wine-800">${wine.price}</span>
        {wine._score && <span className="text-[10px] text-gray-400">Match: {wine._score}%</span>}
      </div>
      {wine.video_url && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowVideo(true)}
            className="text-xs px-2.5 py-1.5 rounded-md bg-wine-50 text-wine-700 hover:bg-wine-100 transition-colors"
          >
            {wine.video_title || "Watch video"}
          </button>
        </div>
      )}

      {showVideo && embedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-800">{wine.video_title || wine.name}</p>
              <button
                type="button"
                onClick={() => setShowVideo(false)}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
              <iframe
                src={embedUrl}
                title={wine.video_title || wine.name}
                className="absolute inset-0 h-full w-full rounded-md"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogGroupedView({ grouped, lang }: { grouped: CatalogGrouped; lang: "zh" | "en" }) {
  const colorLabels = { red: lang === "zh" ? "红酒" : "Red", white: lang === "zh" ? "白酒" : "White", rose: lang === "zh" ? "桃红" : "Rosé", sparkling: lang === "zh" ? "起泡" : "Sparkling" };
  const sections = (["red", "white", "rose", "sparkling"] as const).filter(
    (k) => grouped[k] && grouped[k]!.length > 0
  );
  return (
    <div className="mt-3 pt-2 border-t border-gray-100 space-y-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">
        {lang === "zh" ? "按红/白与品种分类" : "By color & variety"}
      </p>
      {sections.map((colorKey) => (
        <div key={colorKey} className="space-y-2">
          <h4 className="text-xs font-semibold text-wine-700 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${colorKey === "red" ? "bg-red-500" : colorKey === "white" ? "bg-amber-400" : colorKey === "rose" ? "bg-pink-400" : "bg-sky-400"}`} />
            {colorLabels[colorKey]}
          </h4>
          <div className="space-y-2.5 pl-3 border-l-2 border-gray-100">
            {(grouped[colorKey] ?? []).map((sec) => (
              <div key={sec.variety}>
                <p className="text-[11px] font-medium text-gray-600 mb-1">{sec.variety}</p>
                <div className="flex flex-wrap gap-1.5">
                  {sec.wines.map((w) => (
                    <span
                      key={w.id}
                      className="text-[11px] px-2 py-1 rounded-md bg-gray-50 text-gray-700 border border-gray-100"
                      title={`${w.name} · ${w.sku} · $${w.price}`}
                    >
                      {w.name_cn || w.name}（{w.sku}）
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WineryCard({ winery, lang }: { winery: WineryDisplay; lang: "zh" | "en" }) {
  const name = lang === "zh" ? winery.name_zh : winery.name_en;
  const intro = lang === "zh" ? winery.intro_zh : winery.intro_en;
  const selling = lang === "zh" ? winery.selling_points_zh : winery.selling_points_en;
  const body = intro || selling;
  return (
    <div className="winery-card bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
      <p className="font-semibold text-gray-900 text-sm">{name}</p>
      {body && <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">{body}</p>}
    </div>
  );
}

export function MessageBubble({ message, showDebug, onQuickQuestionSelect }: Props) {
  const isUser = message.role === "user";
  const lang: "zh" | "en" = typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en";

  return (
    <div>
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-wine-700 text-white rounded-br-md shadow-sm"
              : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-md"
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-a:text-wine-700">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
          {message.catalog_grouped && (
            <CatalogGroupedView grouped={message.catalog_grouped} lang={lang} />
          )}
          {message.wineries && message.wineries.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">
                {lang === "zh" ? "酒庄" : "Wineries"}
              </p>
              {message.wineries.map((w) => (
                <WineryCard key={w.id} winery={w} lang={lang} />
              ))}
            </div>
          )}
          {message.wines && message.wines.length > 0 && !message.catalog_grouped && (
            <div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Recommended wines</p>
              {message.wines.map((wine) => (
                <WineCard key={wine.id} wine={wine} />
              ))}
            </div>
          )}
          {message.quick_questions && message.quick_questions.length > 0 && onQuickQuestionSelect && (
            <div className="mt-3 pt-2 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Suggested questions</p>
              <div className="flex flex-wrap gap-1.5">
                {message.quick_questions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onQuickQuestionSelect(q)}
                    className="text-xs px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    {q.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showDebug && !isUser && message._debug && (
        <DebugPanel debug={message._debug} />
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, ChatResponse } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

const QUICK_ACTIONS = [
  { label: "Red wine for steak dinner", icon: "🥩" },
  { label: "Gift wine under $35", icon: "🎁" },
  { label: "Light wine for summer", icon: "☀️" },
  { label: "What is tannin?", icon: "📖" },
];

interface QuickQueryQuestion {
  id: string;
  text_zh: string;
  text_en: string;
}

const quickQueryLanguage = (): "zh" | "en" =>
  typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en";

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [debugMode, setDebugMode] = useState(false);
  const [quickQueryOpen, setQuickQueryOpen] = useState(false);
  const [quickQueryQuestions, setQuickQueryQuestions] = useState<QuickQueryQuestion[]>([]);
  const [quickQueryLoading, setQuickQueryLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lang = quickQueryLanguage();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const adjustTextareaHeight = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  };

  const sendMessage = async (text?: string) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionId || undefined,
        }),
      });

      const data: ChatResponse = await res.json();

      if (!sessionId && data.session_id) {
        setSessionId(data.session_id);
      }

      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: data.message,
        timestamp: Date.now(),
        wines: data.wines,
        quick_questions: data.quick_questions,
        _debug: data._debug,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content:
          "Sorry, there was a connection issue. Please try again.\n\n抱歉，连接出现了问题，请稍后再试。",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionId("");
    setInput("");
  };

  const openQuickQuery = useCallback(async () => {
    setQuickQueryOpen((prev) => !prev);
    if (quickQueryQuestions.length === 0) {
      setQuickQueryLoading(true);
      try {
        const res = await fetch("/api/fastpath/questions");
        const data = await res.json();
        if (Array.isArray(data.questions)) setQuickQueryQuestions(data.questions);
      } finally {
        setQuickQueryLoading(false);
      }
    }
  }, [quickQueryQuestions.length]);

  const sendQuickQueryAnswer = async (q: QuickQueryQuestion) => {
    if (isLoading) return;
    const questionText = lang === "zh" ? q.text_zh : q.text_en;
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: questionText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuickQueryOpen(false);
    setIsLoading(true);
    try {
      const res = await fetch("/api/fastpath/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: q.id, language: lang }),
      });
      if (!res.ok) {
        const err: ChatMessage = {
          id: uuidv4(),
          role: "assistant",
          content: lang === "zh" ? "该问题暂无固定答案，请稍后在对话中提问。" : "No fixed answer for this question. Try asking in chat.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, err]);
        return;
      }
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: data.message ?? "",
        timestamp: Date.now(),
        wines: data.wines,
        catalog_grouped: data.catalog_grouped,
        wineries: data.wineries,
        quick_questions: data.quick_questions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: lang === "zh" ? "连接出错，请稍后再试。" : "Connection error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  /** 按 question_id 请求快速查询答案（用于追问如 Q_E_1 酒庄介绍、Q_E_2 酒庄卖点） */
  const sendQuickQueryAnswerById = async (questionId: string, questionText: string) => {
    if (isLoading) return;
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: questionText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    try {
      const res = await fetch("/api/fastpath/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, language: lang }),
      });
      if (!res.ok) {
        const err: ChatMessage = {
          id: uuidv4(),
          role: "assistant",
          content: lang === "zh" ? "该问题暂无固定答案。" : "No fixed answer for this question.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, err]);
        return;
      }
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: data.message ?? "",
        timestamp: Date.now(),
        wines: data.wines,
        catalog_grouped: data.catalog_grouped,
        wineries: data.wineries,
        quick_questions: data.quick_questions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: lang === "zh" ? "连接出错，请稍后再试。" : "Connection error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const isEmptyChat = messages.length === 0;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-wine-100/60 bg-white/70 backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-wine-600 to-wine-800 flex items-center justify-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white/90">
              <path d="M11.25 3v4.046a3 3 0 0 0-4.277 4.204H1.5v-6A2.25 2.25 0 0 1 3.75 3h7.5ZM12.75 3v4.011a3 3 0 0 1 4.239 4.239H22.5v-6A2.25 2.25 0 0 0 20.25 3h-7.5ZM22.5 12.75h-8.983a4.125 4.125 0 0 0 4.108 3.75.75.75 0 0 1 0 1.5 5.623 5.623 0 0 1-4.875-2.838V21h7.5a2.25 2.25 0 0 0 2.25-2.25v-6ZM11.25 21v-5.838A5.623 5.623 0 0 1 6.375 18a.75.75 0 0 1 0-1.5 4.126 4.126 0 0 0 4.108-3.75H1.5v6A2.25 2.25 0 0 0 3.75 21h7.5Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">Wine Advisor</h1>
            <p className="text-[11px] text-wine-500/80 leading-tight">AI 选酒顾问</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={openQuickQuery}
            className={`text-xs px-2.5 py-1.5 rounded-md transition-all ${
              quickQueryOpen
                ? "bg-wine-100 text-wine-700 ring-1 ring-wine-200"
                : "text-wine-600 hover:bg-wine-50"
            }`}
            title="快速查询"
          >
            快速查询
          </button>
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`text-[10px] px-2 py-1 rounded-md transition-all ${
              debugMode
                ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200"
                : "text-gray-400 hover:text-gray-500 hover:bg-gray-50"
            }`}
          >
            Debug
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs text-gray-400 hover:text-wine-600 transition-colors px-2 py-1.5 rounded-md hover:bg-wine-50/50"
              title="New chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V3.537a.75.75 0 0 0-1.5 0v2.033l-.312-.31A7 7 0 0 0 3.239 8.397a.75.75 0 0 0 1.449.388 5.5 5.5 0 0 1 9.2-2.466l.312.311h-2.433a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .53-.22Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Quick Query panel */}
      {quickQueryOpen && (
        <div className="border-b border-wine-100/60 bg-wine-50/50 px-4 py-3 z-10">
          {quickQueryLoading ? (
            <p className="text-sm text-gray-500">加载中…</p>
          ) : quickQueryQuestions.length === 0 ? (
            <p className="text-sm text-gray-500">暂无预设问题</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {quickQueryQuestions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => sendQuickQueryAnswer(q)}
                  disabled={isLoading}
                  className="quick-action flex items-center gap-1.5"
                >
                  <span>{lang === "zh" ? q.text_zh : q.text_en}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-scroll px-3 sm:px-4 py-4">
        {isEmptyChat ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 -mt-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-wine-100 to-wine-200 flex items-center justify-center mb-5 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-wine-600">
                <path d="M11.25 3v4.046a3 3 0 0 0-4.277 4.204H1.5v-6A2.25 2.25 0 0 1 3.75 3h7.5ZM12.75 3v4.011a3 3 0 0 1 4.239 4.239H22.5v-6A2.25 2.25 0 0 0 20.25 3h-7.5ZM22.5 12.75h-8.983a4.125 4.125 0 0 0 4.108 3.75.75.75 0 0 1 0 1.5 5.623 5.623 0 0 1-4.875-2.838V21h7.5a2.25 2.25 0 0 0 2.25-2.25v-6ZM11.25 21v-5.838A5.623 5.623 0 0 1 6.375 18a.75.75 0 0 1 0-1.5 4.126 4.126 0 0 0 4.108-3.75H1.5v6A2.25 2.25 0 0 0 3.75 21h7.5Z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1.5">
              Welcome to Wine Advisor
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">
              I help you find the perfect wines from our catalog for your store. Tell me what you need.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.label)}
                  className="quick-action flex items-center gap-1.5"
                  disabled={isLoading}
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-8">
              Supports English and Chinese / 支持中英文
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="message-enter">
                <MessageBubble
                  message={msg}
                  showDebug={debugMode}
                  onQuickQuestionSelect={(q) => {
                  if (q.id.startsWith("Q_E_1_") || q.id.startsWith("Q_E_2_")) {
                    sendQuickQueryAnswerById(q.id, q.text);
                  } else {
                    sendMessage(q.text);
                  }
                }}
                />
              </div>
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-wine-100/40 bg-white/70 backdrop-blur-md px-3 sm:px-4 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder={isEmptyChat ? "Ask me anything about wines..." : "Type a message..."}
              rows={1}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 pr-12 text-sm
                         focus:outline-none focus:ring-2 focus:ring-wine-200 focus:border-wine-300
                         placeholder:text-gray-400 transition-all shadow-sm"
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="absolute right-1.5 bottom-1.5 w-8 h-8 rounded-lg bg-wine-700 text-white
                         flex items-center justify-center
                         hover:bg-wine-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                         transition-all shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2">
          AI responses are for reference only / 回复仅供参考
        </p>
      </div>
    </div>
  );
}

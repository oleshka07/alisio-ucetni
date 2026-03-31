"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  X,
  Send,
  Paperclip,
  Loader2,
  Sparkles,
  FileText,
  Trash2,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  fileName?: string;
}

export default function AiAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const fileToBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data:...;base64,
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !file) return;
    if (loading) return;

    const userMessage: Message = {
      role: "user",
      content: text || `[Přiložený soubor: ${file?.name}]`,
      fileName: file?.name,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      let filePayload: { base64: string; fileName: string; mimeType: string } | undefined;
      if (file) {
        const base64 = await fileToBase64(file);
        filePayload = {
          base64,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        };
        setFile(null);
      }

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          file: filePayload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Chyba serveru");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);

      // Refresh data in case AI made changes
      router.refresh();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${err instanceof Error ? err.message : "Chyba při komunikaci s AI"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setFile(null);
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          title="AI Asistent"
        >
          <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[580px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">ALISIO AI</h3>
              <p className="text-xs text-white/70">Účetní asistent</p>
            </div>
            <button
              onClick={clearChat}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Vymazat chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Ahoj! Jsem ALISIO AI.
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-[280px] mx-auto">
                  Mohu vyhledávat informace o klientech, vytvářet úkoly, číst
                  dokumenty a mnohem více.
                </p>
                <div className="mt-4 space-y-1.5">
                  {[
                    "Ukaž mi všechny klienty",
                    "Jaké úkoly má Stepeniev?",
                    "Vytvoř nového klienta",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="block w-full text-left px-3 py-2 text-xs text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      💡 {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-500 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-800 rounded-bl-md"
                  }`}
                >
                  {msg.fileName && (
                    <div
                      className={`flex items-center gap-1.5 text-xs mb-1.5 ${
                        msg.role === "user"
                          ? "text-indigo-200"
                          : "text-gray-500"
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      {msg.fileName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {formatMessage(msg.content)}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Přemýšlím...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* File preview */}
          {file && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="text-xs text-gray-600 truncate flex-1">
                {file.name}
              </span>
              <span className="text-xs text-gray-400">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                onClick={() => setFile(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100 bg-white shrink-0">
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                title="Přiložit soubor"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) {
                      alert("Max 10 MB");
                      return;
                    }
                    setFile(f);
                  }
                  e.target.value = "";
                }}
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu..."
                rows={1}
                className="flex-1 resize-none text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 max-h-24 bg-gray-50"
                style={{
                  height: "auto",
                  minHeight: "40px",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && !file)}
                className="p-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Simple markdown-like formatting
function formatMessage(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// src/pages/Chat.tsx
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useApp } from "../context/AppContext";
import { ErrorBanner } from "../components/ui";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  "How much did I spend this month?",
  "Which category am I overspending on?",
  "What were my top 5 expenses last month?",
  "How does my spending compare to my budget?",
];

export default function Chat() {
  const { userId } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setError("");
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.chat.ask(userId, text.trim());
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <h1 className="text-lg font-semibold text-slate-800 mb-4">
        AI assistant
      </h1>

      {/* Chat window */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Ask anything about your finances. The AI reads your transaction
              and budget data directly.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white border border-slate-100 text-slate-700 rounded-bl-sm shadow-sm"
                }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <ErrorBanner message={error} />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-3 items-end bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <textarea
          rows={1}
          placeholder="Ask about your spending…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 resize-none text-sm text-slate-700 placeholder-slate-400 focus:outline-none max-h-32"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

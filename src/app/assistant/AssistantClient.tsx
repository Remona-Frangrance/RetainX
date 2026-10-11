"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";

type Msg = { role: "user" | "assistant"; text: string; tool?: string; data?: unknown; engine?: string; suggestions?: string[]; error?: boolean; ts: number };

const SUGGESTIONS = [
  "How many customers are high risk?",
  "Which subscription type has the highest churn?",
  "What are the main churn drivers?",
  "Which customers are most likely to churn?",
  "Show customers with more than 80% churn probability",
  "How many high-risk customers are on the Basic plan?",
  "Compare churn by device",
  "How does viewing behaviour differ for churned customers?",
  "How does account age relate to churn?",
  "How much revenue is associated with high-risk customers?",
  "Which segments have the highest risk?",
  "How accurate is the model?",
];

const WELCOME = "Hi — I'm the ChurnSense assistant. Every answer I give comes from live calls to the churn model and the customer database through the tool layer, so I never invent numbers. Ask about KPIs, risk levels, churn by plan/device/payment/tenure, churn drivers, segments, revenue at risk, model performance, or any customer by ID (e.g. \u201cWhy is C113657 at risk?\u201d).";

export function AssistantClient() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: WELCOME, tool: "help", ts: Date.now() }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<{ name: string; description: string }[]>([]);
  const [engine, setEngine] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/tools").then((r) => r.json()).then((d) => setTools(d.tools ?? [])).catch(() => {});
    fetch("/api/assistant").then((r) => r.json()).then((d) => setEngine(d.engine ?? "")).catch(() => {});
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: question, ts: Date.now() }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }), signal: ctrl.signal });
      const text = await res.text();
      let d: { answer?: string; error?: string; tool?: string; data?: unknown; engine?: string; suggestions?: string[] } = {};
      try {
        d = JSON.parse(text);
      } catch {
        d = { error: `Unexpected response (${res.status}).` };
      }
      if (!res.ok || d.error) {
        setMessages((m) => [...m, { role: "assistant", text: d.error ?? `Request failed (${res.status}).`, error: true, ts: Date.now() }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: d.answer ?? "", tool: d.tool, data: d.data, engine: d.engine, suggestions: d.suggestions, ts: Date.now() }]);
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setMessages((m) => [...m, { role: "assistant", text: aborted ? "The request timed out — the model may still be warming up. Please try again." : `Network error: ${(e as Error).message}`, error: true, ts: Date.now() }]);
    } finally {
      clearTimeout(timer);
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="flex h-[calc(100vh-13rem)] min-h-[560px] flex-col !p-0 lg:col-span-2">
        {/* header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl text-white"
              style={{
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                boxShadow: "0 0 16px -4px rgba(99,102,241,0.5)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">ChurnSense Assistant</div>
              <div className="text-[11px] text-slate-500">Grounded in the live model & database{engine ? ` · engine: ${engine}` : ""}</div>
            </div>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => setMessages([{ role: "assistant", text: WELCOME, tool: "help", ts: Date.now() }])}>
            Clear chat
          </button>
        </div>

        {/* messages */}
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.map((m, i) => (
            <div key={m.ts + i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} fade-up`}>
              {m.role === "assistant" && (
                <div
                  className="mr-2 mt-1 hidden h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold sm:grid"
                  style={{
                    background: "rgba(99,102,241,0.15)",
                    color: "#818cf8",
                    border: "1px solid rgba(99,102,241,0.25)",
                  }}
                >
                  AI
                </div>
              )}
              <div className={`max-w-[88%] sm:max-w-[80%]`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md text-white"
                      : m.error
                        ? "rounded-bl-md text-slate-300"
                        : "rounded-bl-md text-slate-300"
                  }`}
                  style={
                    m.role === "user"
                      ? {
                          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                          boxShadow: "0 4px 16px -4px rgba(99,102,241,0.5)",
                        }
                      : m.error
                        ? {
                            background: "rgba(244,63,94,0.08)",
                            border: "1px solid rgba(244,63,94,0.2)",
                          }
                        : {
                            background: "rgba(15,23,42,0.6)",
                            border: "1px solid rgba(99,102,241,0.12)",
                          }
                  }
                >
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  {m.role === "assistant" && m.tool && !m.error && (
                    <div
                      className="mt-2 flex flex-wrap items-center gap-2 pt-2 text-[10px] uppercase tracking-wide text-slate-500"
                      style={{ borderTop: "1px solid rgba(99,102,241,0.1)" }}
                    >
                      <span
                        className="rounded px-1.5 py-0.5 font-mono normal-case"
                        style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}
                      >
                        tool: {m.tool}
                      </span>
                      {m.data !== undefined && (
                        <details className="normal-case tracking-normal">
                          <summary className="cursor-pointer text-indigo-400">raw result</summary>
                          <pre className="scrollbar-thin mt-1 max-h-48 max-w-full overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] text-slate-100">{JSON.stringify(m.data, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
                {m.role === "assistant" && m.suggestions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s) => (
                      <button key={s} type="button" className="chip" onClick={() => ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
              </span>
              Querying model & database…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* input */}
        <form
          style={{ borderTop: "1px solid rgba(99,102,241,0.12)" }}
          className="p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div
            className="flex items-center gap-2 rounded-2xl p-1.5 pl-4"
            style={{
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(99,102,241,0.2)",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)",
            }}
          >
            <input ref={inputRef} className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about churn, customers, drivers, segments, revenue, model…" disabled={busy} />
            <button className="btn-primary !rounded-xl !px-4" disabled={busy || !input.trim()} type="submit">
              {busy ? "…" : "Ask"}
            </button>
          </div>
          <div className="mt-1.5 px-2 text-[11px] text-slate-500">Answers describe model associations, not causes. Sensitive attributes are never exposed.</div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card title="Try asking" subtitle="Click to send">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="chip text-left" disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        </Card>
        <Card title="How it works" subtitle="MCP-style tool layer at /api/tools">
          <ol
            className="relative ml-2 space-y-3 pl-4 text-xs text-slate-400"
            style={{ borderLeft: "1px solid rgba(99,102,241,0.2)" }}
          >
            {["Your question is parsed for intent and entities (customer ID, plan, %, dimension).", "The matching tool is called against the trained model and PostgreSQL.", "The answer is composed only from the tool result — nothing is fabricated.", "If an OpenAI-compatible LLM is configured (OPENAI_API_KEY or LLM_BASE_URL), it orchestrates the same tools."].map((t, i) => (
              <li key={i} className="relative">
                <span
                  className="absolute -left-[22px] top-0.5 grid h-3 w-3 place-items-center rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    boxShadow: "0 0 8px 2px rgba(99,102,241,0.3), 0 0 0 3px #060918",
                  }}
                />
                {t}
              </li>
            ))}
          </ol>
          <div className="divider" />
          <ul className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto text-xs">
            {tools.map((t) => (
              <li
                key={t.name}
                className="rounded-lg px-2.5 py-1.5"
                style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.4)" }}
              >
                <code className="font-semibold text-indigo-400">{t.name}</code>
                <div className="text-[11px] text-slate-500">{t.description}</div>
              </li>
            ))}
          </ul>
          <Link href="/about" className="btn-ghost mt-2 text-xs">
            Model card & API docs →
          </Link>
        </Card>
      </div>
    </div>
  );
}

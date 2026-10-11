"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "@/components/Sidebar";

export function TopBar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<{ ok: boolean; modelReady: boolean } | null>(null);
  const [q, setQ] = useState("");
  const current = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, modelReady: false }));
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-20 hidden lg:block"
      style={{
        background: "rgba(6,9,24,0.7)",
        borderBottom: "1px solid rgba(99,102,241,0.1)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 4px 24px -4px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-8 py-3">
        {/* breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="text-slate-500">RetainX</span>
          <span className="text-slate-600">/</span>
          <span className="font-medium text-slate-200">{current?.label ?? "Customer"}</span>
        </div>

        {/* search bar */}
        <form
          className="ml-auto flex w-72 items-center gap-2 rounded-xl px-3 py-1.5"
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(99,102,241,0.15)",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)",
            transition: "all 0.3s ease",
          }}
          action="/customers"
          method="get"
          onSubmit={(e) => {
            const id = q.trim().toUpperCase();
            if (/^C\d{4,}$/.test(id)) {
              e.preventDefault();
              window.location.href = `/customers/${id}`;
            }
          }}
          onFocus={(e) => {
            const form = e.currentTarget;
            form.style.borderColor = "rgba(99,102,241,0.4)";
            form.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.3), 0 0 0 3px rgba(99,102,241,0.1), 0 0 20px -6px rgba(99,102,241,0.2)";
          }}
          onBlur={(e) => {
            const form = e.currentTarget;
            form.style.borderColor = "rgba(99,102,241,0.15)";
            form.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.3)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            name="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to customer ID…"
            className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
          <kbd
            className="rounded px-1.5 text-[10px] text-slate-500"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
          >
            ↵
          </kbd>
        </form>

        {/* health status */}
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs text-slate-300"
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(99,102,241,0.15)",
          }}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              health === null
                ? "bg-slate-500"
                : health.ok && health.modelReady
                  ? "bg-emerald-400"
                  : "bg-amber-400"
            }`}
            style={
              health?.ok && health.modelReady
                ? {
                    boxShadow: "0 0 6px 2px rgba(52,211,153,0.4), 0 0 12px 4px rgba(52,211,153,0.2)",
                    animation: "glow-pulse 2s ease-in-out infinite",
                  }
                : undefined
            }
          />
          {health === null ? "Checking…" : health.ok && health.modelReady ? "Model online" : health.ok ? "Model warming up" : "Service issue"}
        </div>

        {/* new prediction button */}
        <Link href="/predict" className="btn-primary !py-1.5 !text-xs">
          + New prediction
        </Link>
      </div>
    </header>
  );
}

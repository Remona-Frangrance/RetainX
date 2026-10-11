"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const NAV = [
  { href: "/", label: "Dashboard", desc: "KPIs & overview", icon: IconGrid },
  { href: "/customers", label: "Customer Explorer", desc: "Search & filter", icon: IconUsers },
  { href: "/analysis", label: "Churn Analysis", desc: "Business insights", icon: IconChart },
  { href: "/model", label: "Model Insights", desc: "Metrics & drivers", icon: IconCpu },
  { href: "/predict", label: "Prediction", desc: "Score & upload CSV", icon: IconTarget },
  { href: "/assistant", label: "AI Assistant", desc: "Ask the data", icon: IconSpark },
  { href: "/about", label: "About Model", desc: "Transparency", icon: IconInfo },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav className="mt-8 flex flex-col gap-1">
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</div>
      {NAV.map((n) => {
        const active = isActive(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300 ${
              active
                ? "text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {/* active background glow */}
            {active && (
              <span
                className="absolute inset-0 rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))",
                  border: "1px solid rgba(99,102,241,0.25)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 20px -8px rgba(99,102,241,0.4)",
                }}
              />
            )}
            {/* neon left indicator */}
            {active && (
              <span
                className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full"
                style={{
                  background: "linear-gradient(180deg, #818cf8, #c084fc)",
                  boxShadow: "0 0 12px 2px rgba(129,140,248,0.5), 0 0 24px 4px rgba(192,132,252,0.3)",
                }}
              />
            )}
            {/* 3D icon container */}
            <span
              className={`relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-300 ${
                active
                  ? "text-white"
                  : "text-slate-400 group-hover:text-white"
              }`}
              style={active ? {
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                boxShadow: "0 4px 12px -2px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
              } : {
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <Icon />
            </span>
            <span className="relative z-[1] flex flex-col leading-tight">
              <span className="font-medium">{n.label}</span>
              <span className="text-[11px] text-slate-500">{n.desc}</span>
            </span>
            {/* hover glow for non-active */}
            {!active && (
              <span className="absolute inset-0 rounded-xl bg-white/0 transition-all duration-300 group-hover:bg-white/[0.03]" />
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col px-4 py-6 text-white lg:flex"
        style={{
          background: "linear-gradient(180deg, rgba(6,9,24,0.95), rgba(11,16,32,0.98))",
          borderRight: "1px solid rgba(99,102,241,0.1)",
          boxShadow: "4px 0 24px -4px rgba(0,0,0,0.4)",
          backdropFilter: "blur(20px)",
        }}
      >
        <Brand />
        {nav}
        {/* responsible AI card with holographic sheen */}
        <div
          className="holo-sheen mt-auto rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08), rgba(236,72,153,0.06))",
            border: "1px solid rgba(99,102,241,0.2)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px -8px rgba(99,102,241,0.2)",
          }}
        >
          <div className="text-xs font-semibold text-white">✦ Responsible AI</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Scores are model-estimated risk. Factors are associations, not causes. Sensitive attributes are excluded.</p>
          <Link href="/about" className="mt-2 inline-block text-[11px] font-medium text-indigo-300 transition hover:text-white hover:text-shadow">
            Read model card →
          </Link>
        </div>
      </aside>

      {/* mobile */}
      <div
        className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-3 text-white lg:hidden"
        style={{
          background: "rgba(6,9,24,0.95)",
          borderBottom: "1px solid rgba(99,102,241,0.15)",
          backdropFilter: "blur(20px)",
        }}
      >
        <Brand compact />
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg px-3 py-1.5 text-sm transition"
          style={{ border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)" }}
          aria-label="Toggle navigation"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-30 px-6 pt-16 text-white lg:hidden"
          style={{ background: "rgba(6,9,24,0.98)", backdropFilter: "blur(24px)" }}
          onClick={() => setOpen(false)}
        >
          {nav}
        </div>
      )}
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div
        className="relative grid h-10 w-10 place-items-center rounded-xl"
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6, #c084fc)",
          boxShadow: "0 0 24px -4px rgba(139,92,246,0.6), 0 8px 20px -6px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
        }}
      >
        {/* animated glow ring */}
        <span
          className="glow-pulse absolute inset-[-3px] rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(192,132,252,0.3))",
            filter: "blur(6px)",
            zIndex: -1,
          }}
        />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l5-6 4 4 6-8 3 3" />
        </svg>
      </div>
      <div>
        <div className="text-[15px] font-semibold leading-tight tracking-tight neon-text">RetainX</div>
        {!compact && <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Retention Intelligence</div>}
      </div>
    </Link>
  );
}

const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconGrid() {
  return (
    <svg {...svg}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg {...svg}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.5a5 5 0 0 1 6 5" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg {...svg}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
}
function IconCpu() {
  return (
    <svg {...svg}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg {...svg}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

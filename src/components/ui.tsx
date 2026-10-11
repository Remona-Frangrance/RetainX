import { RISK_COLORS, type RiskLevel } from "@/lib/config";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, right, eyebrow }: { title: string; subtitle?: string; right?: ReactNode; eyebrow?: string }) {
  return (
    <div className="fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-400">{eyebrow}</div>}
        <h1
          className="text-[26px] font-semibold tracking-tight sm:text-[32px]"
          style={{
            background: "linear-gradient(135deg, #e2e8f0, #c7d2fe, #a5b4fc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Dark 3D hero used at the top of the dashboard. */
export function Hero({ title, subtitle, children, right }: { title: string; subtitle: string; children?: ReactNode; right?: ReactNode }) {
  return (
    <section
      className="fade-up relative mb-6 overflow-hidden rounded-3xl px-6 py-8 text-white sm:px-8"
      style={{
        background: "linear-gradient(135deg, rgba(11,16,32,0.95), rgba(15,23,42,0.9))",
        border: "1px solid rgba(99,102,241,0.2)",
        boxShadow: "0 24px 80px -24px rgba(99,102,241,0.25), 0 0 0 1px rgba(99,102,241,0.05), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* floating orb top-right */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.35), rgba(139,92,246,0.15), transparent 70%)",
          filter: "blur(40px)",
          animation: "float 8s ease-in-out infinite",
        }}
      />
      {/* floating orb bottom-left */}
      <div
        className="pointer-events-none absolute -bottom-28 left-1/4 h-72 w-72 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(236,72,153,0.25), rgba(168,85,247,0.1), transparent 70%)",
          filter: "blur(50px)",
          animation: "float 10s ease-in-out infinite reverse",
        }}
      />
      {/* grid overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black, transparent 75%)",
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <div
            className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium text-indigo-200"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              boxShadow: "0 0 12px -4px rgba(99,102,241,0.3)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 6px 2px rgba(52,211,153,0.5)" }}
            />
            Live model · PostgreSQL-backed analytics
          </div>
          <h1
            className="text-[28px] font-semibold tracking-tight sm:text-[34px]"
            style={{
              background: "linear-gradient(135deg, #fff, #c7d2fe, #a5b4fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {title}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">{subtitle}</p>
          {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
        </div>
        {right}
      </div>
    </section>
  );
}

export function Card({ title, subtitle, children, className = "", action, hover = false }: { title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode; hover?: boolean }) {
  return (
    <section className={`card fade-up ${hover ? "card-hover gradient-border" : ""} ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Accent = "indigo" | "rose" | "amber" | "emerald" | "sky";
const ACCENTS: Record<Accent, { grad: string; glow: string; iconBg: string; iconColor: string }> = {
  indigo: { grad: "linear-gradient(135deg, #6366f1, #818cf8)", glow: "rgba(99,102,241,0.4)", iconBg: "rgba(99,102,241,0.15)", iconColor: "#818cf8" },
  rose: { grad: "linear-gradient(135deg, #f43f5e, #fb7185)", glow: "rgba(244,63,94,0.4)", iconBg: "rgba(244,63,94,0.15)", iconColor: "#fb7185" },
  amber: { grad: "linear-gradient(135deg, #f59e0b, #fbbf24)", glow: "rgba(245,158,11,0.4)", iconBg: "rgba(245,158,11,0.15)", iconColor: "#fbbf24" },
  emerald: { grad: "linear-gradient(135deg, #10b981, #34d399)", glow: "rgba(16,185,129,0.4)", iconBg: "rgba(16,185,129,0.15)", iconColor: "#34d399" },
  sky: { grad: "linear-gradient(135deg, #0ea5e9, #38bdf8)", glow: "rgba(14,165,233,0.4)", iconBg: "rgba(14,165,233,0.15)", iconColor: "#38bdf8" },
};

export function Kpi({ label, value, hint, accent = "indigo", icon, delta }: { label: string; value: string; hint?: string; accent?: Accent; icon?: ReactNode; delta?: { text: string; tone: "up" | "down" | "neutral" } }) {
  const a = ACCENTS[accent];
  return (
    <div className="card card-hover fade-up relative overflow-hidden gradient-border">
      {/* accent glow orb */}
      <div
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-30"
        style={{ background: a.grad, filter: "blur(24px)" }}
      />
      {/* accent stripe top */}
      <div
        className="absolute left-0 right-0 top-0 h-[2px]"
        style={{ background: a.grad, boxShadow: `0 0 12px 2px ${a.glow}` }}
      />
      <div className="relative flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</div>
        {icon && (
          <div
            className="grid h-9 w-9 place-items-center rounded-lg"
            style={{
              background: a.iconBg,
              color: a.iconColor,
              boxShadow: `0 0 16px -4px ${a.glow}`,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {delta && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{
              background: delta.tone === "up" ? "rgba(244,63,94,0.15)" : delta.tone === "down" ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.15)",
              color: delta.tone === "up" ? "#fb7185" : delta.tone === "down" ? "#34d399" : "#94a3b8",
              border: `1px solid ${delta.tone === "up" ? "rgba(244,63,94,0.25)" : delta.tone === "down" ? "rgba(16,185,129,0.25)" : "rgba(100,116,139,0.25)"}`,
            }}
          >
            {delta.text}
          </span>
        )}
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export function RiskBadge({ level, size = "sm" }: { level: string; size?: "sm" | "md" }) {
  const color = RISK_COLORS[level as RiskLevel] ?? "#64748b";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-[11px]"}`}
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 12px -4px ${color}40`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 6px 2px ${color}50, 0 0 12px 4px ${color}25`,
          animation: level === "Very High" || level === "High" ? "glow-pulse 2s ease-in-out infinite" : undefined,
        }}
      />
      {level}
    </span>
  );
}

export function ProbBar({ p, width = "w-24" }: { p: number; width?: string }) {
  const color = p >= 0.8 ? "#ef4444" : p >= 0.6 ? "#f97316" : p >= 0.3 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`h-2 ${width} overflow-hidden rounded-full`}
        style={{ background: "rgba(15,23,42,0.6)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.round(p * 100)}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 8px 1px ${color}50`,
          }}
        />
      </div>
      <span className="tabular-nums text-sm font-semibold text-slate-200">{(p * 100).toFixed(1)}%</span>
    </div>
  );
}

export function Stat({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "rose" | "indigo" | "emerald" }) {
  const colors = {
    slate: { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.2)", text: "#cbd5e1" },
    rose: { bg: "rgba(244,63,94,0.1)", border: "rgba(244,63,94,0.2)", text: "#fb7185" },
    indigo: { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.2)", text: "#a5b4fc" },
    emerald: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)", text: "#34d399" },
  }[tone];
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: colors.text }}>{value}</div>
    </div>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title?: string; children: ReactNode }) {
  const styles = tone === "warn"
    ? { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#fbbf24" }
    : { bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)", text: "#c7d2fe" };
  return (
    <div
      className="rounded-2xl p-4 text-sm leading-relaxed text-slate-300"
      style={{ background: styles.bg, border: `1px solid ${styles.border}` }}
    >
      {title && <div className="mb-1 font-semibold" style={{ color: styles.text }}>{title}</div>}
      {children}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div
      className="grid place-items-center rounded-xl py-10 text-center text-sm text-slate-500"
      style={{ border: "1px dashed rgba(99,102,241,0.2)", background: "rgba(15,23,42,0.3)" }}
    >
      <div className="mb-2 text-2xl opacity-40">◌</div>
      {text}
    </div>
  );
}

export const fmtPct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const fmtInt = (x: number) => x.toLocaleString("en-US");
export const fmtMoney = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

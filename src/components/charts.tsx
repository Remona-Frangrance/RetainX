"use client";

import { RISK_COLORS, type RiskLevel } from "@/lib/config";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Dark glassmorphic tooltip
const TT = {
  contentStyle: {
    borderRadius: 14,
    border: "1px solid rgba(99,102,241,0.25)",
    background: "rgba(11,16,32,0.9)",
    backdropFilter: "blur(16px)",
    boxShadow: "0 12px 40px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
    fontSize: 12,
    padding: "10px 14px",
    color: "#e2e8f0",
  },
  cursor: { fill: "rgba(99,102,241,0.08)" },
  itemStyle: { color: "#cbd5e1" },
  labelStyle: { color: "#94a3b8", fontWeight: 600, marginBottom: 4 },
} as const;

const AXIS = {
  stroke: "rgba(99,102,241,0.15)",
  tickLine: false as const,
  axisLine: false as const,
};

const GRID_STYLE = { stroke: "rgba(99,102,241,0.08)", strokeDasharray: "3 3" };

// Neon chart palette
const NEON = {
  indigo: "#818cf8",
  violet: "#a78bfa",
  fuchsia: "#e879f9",
  rose: "#fb7185",
  cyan: "#22d3ee",
  emerald: "#34d399",
  amber: "#fbbf24",
  sky: "#38bdf8",
};

export function RiskDonut({ data }: { data: { level: RiskLevel; count: number; share: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="level" innerRadius={60} outerRadius={95} paddingAngle={3} strokeWidth={0}>
            {data.map((d) => (
              <Cell key={d.level} fill={RISK_COLORS[d.level]} />
            ))}
          </Pie>
          <Tooltip
            {...TT}
            formatter={(v, name, item) => [`${Number(v).toLocaleString()} (${pct(Number(item?.payload?.share ?? 0))})`, String(name)]}
          />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupChurnBar({
  data,
  color = NEON.indigo,
  height = 260,
  showPredicted = true,
}: {
  data: { group: string; churnRate: number; avgProbability: number; customers: number }[];
  color?: string;
  height?: number;
  showPredicted?: boolean;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} {...GRID_STYLE} />
          <XAxis dataKey="group" tick={{ fontSize: 12, fill: "#94a3b8" }} interval={0} {...AXIS} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 12, fill: "#94a3b8" }} {...AXIS} />
          <Tooltip
            {...TT}
            formatter={(v, name) => [pct(Number(v)), name === "churnRate" ? "Observed churn rate" : "Avg. predicted risk"]}
            labelFormatter={(l, payload) => `${l} · ${Number(payload?.[0]?.payload?.customers ?? 0).toLocaleString()} customers`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} formatter={(v) => (v === "churnRate" ? "Observed churn rate" : "Avg. predicted risk")} />
          <Bar dataKey="churnRate" fill={color} radius={[6, 6, 0, 0]} maxBarSize={56} />
          {showPredicted && <Bar dataKey="avgProbability" fill={NEON.violet} radius={[6, 6, 0, 0]} maxBarSize={56} opacity={0.6} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DriversBar({ data, height = 320 }: { data: { label: string; meanAbsImpact: number; meanSignedImpact: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 40, bottom: 0 }}>
          <CartesianGrid horizontal={false} {...GRID_STYLE} />
          <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(1)}`} tick={{ fontSize: 11, fill: "#94a3b8" }} label={{ value: "Mean |Δ probability| (pts)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748b" }} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <Tooltip {...TT} formatter={(v) => [`${(Number(v) * 100).toFixed(2)} pts`, "Mean |impact|"]} />
          <Bar dataKey="meanAbsImpact" radius={[0, 6, 6, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.meanSignedImpact >= 0 ? NEON.indigo : NEON.fuchsia} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AttributionBar({ data, height = 300 }: { data: { label: string; contribution: number; value: string | number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 40, bottom: 0 }}>
          <CartesianGrid horizontal={false} {...GRID_STYLE} />
          <XAxis type="number" tickFormatter={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`} tick={{ fontSize: 11, fill: "#94a3b8" }} label={{ value: "Δ churn probability vs. baseline (pts)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748b" }} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <Tooltip {...TT} formatter={(v, _n, item) => [`${Number(v) > 0 ? "+" : ""}${(Number(v) * 100).toFixed(2)} pts (value: ${item?.payload?.value})`, "Contribution"]} />
          <Bar dataKey="contribution" radius={4}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.contribution >= 0 ? NEON.rose : NEON.emerald} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ViewingHistogram({ data }: { data: { bin: string; churned: number; retained: number; churnRate: number }[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} {...GRID_STYLE} />
          <XAxis dataKey="bin" tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <Tooltip {...TT} labelFormatter={(l, p) => `${l} · churn rate ${pct(Number(p?.[0]?.payload?.churnRate ?? 0))}`} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
          <Bar dataKey="retained" stackId="a" fill={NEON.violet} name="Retained" opacity={0.7} />
          <Bar dataKey="churned" stackId="a" fill={NEON.rose} name="Churned" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgeCurve({ data }: { data: { months: string; churnRate: number; avgProbability: number; customers: number }[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} {...GRID_STYLE} />
          <XAxis dataKey="months" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={2} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <Tooltip
            {...TT}
            formatter={(v, name) => [pct(Number(v)), name === "churnRate" ? "Observed churn rate" : "Avg. predicted risk"]}
            labelFormatter={(l) => `Account age ${l} months`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} formatter={(v) => (v === "churnRate" ? "Observed churn rate" : "Avg. predicted risk")} />
          <Line type="monotone" dataKey="churnRate" stroke={NEON.rose} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="avgProbability" stroke={NEON.indigo} strokeWidth={2.5} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BehaviourBars({ data }: { data: { metric: string; churned: number; retained: number }[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 60, bottom: 0 }}>
          <CartesianGrid horizontal={false} {...GRID_STYLE} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis type="category" dataKey="metric" width={170} tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <Tooltip {...TT} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
          <Bar dataKey="churned" fill={NEON.rose} name="Churned" radius={4} />
          <Bar dataKey="retained" fill={NEON.indigo} name="Retained" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CurveChart({ roc, pr }: { roc: { fpr: number; tpr: number }[]; pr: { recall: number; precision: number }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="h-64">
        <div className="mb-1 text-xs font-medium text-slate-400">ROC curve</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={roc} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="fpr" type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis dataKey="tpr" type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip {...TT} formatter={(v) => Number(v).toFixed(3)} />
            <Line type="monotone" dataKey="tpr" stroke={NEON.indigo} dot={false} strokeWidth={2.5} name="TPR" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64">
        <div className="mb-1 text-xs font-medium text-slate-400">Precision-Recall curve</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={pr} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="recall" type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis dataKey="precision" type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip {...TT} formatter={(v) => Number(v).toFixed(3)} />
            <Line type="monotone" dataKey="precision" stroke={NEON.rose} dot={false} strokeWidth={2.5} name="Precision" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

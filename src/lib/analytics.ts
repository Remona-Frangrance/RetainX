/**
 * Business analytics queries over the scored customer base (PostgreSQL).
 * All numbers are computed from the actual stored data — nothing is hard-coded.
 */

import { db } from "@/db";
import { customers, type Customer } from "@/db/schema";
import { ACCOUNT_AGE_GROUPS, RISK_ORDER, VIEWING_CATEGORIES, type RiskLevel } from "@/lib/config";
import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

export type Overview = {
  totalCustomers: number;
  churned: number;
  retained: number;
  churnRate: number;
  highRiskCustomers: number; // High + Very High
  veryHighRisk: number;
  avgChurnProbability: number;
  highRiskMonthlyRevenue: number; // estimated revenue associated with high-risk customers
  totalMonthlyRevenue: number;
  riskDistribution: { level: RiskLevel; count: number; share: number }[];
};

export async function getOverview(): Promise<Overview> {
  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      churned: sql<number>`sum(${customers.churn})::int`,
      avgProb: sql<number>`avg(${customers.churnProbability})::float`,
      highRisk: sql<number>`sum(case when ${customers.riskLevel} in ('High','Very High') then 1 else 0 end)::int`,
      veryHigh: sql<number>`sum(case when ${customers.riskLevel} = 'Very High' then 1 else 0 end)::int`,
      highRiskRevenue: sql<number>`coalesce(sum(case when ${customers.riskLevel} in ('High','Very High') then ${customers.monthlyCharges} else 0 end),0)::float`,
      totalRevenue: sql<number>`coalesce(sum(${customers.monthlyCharges}),0)::float`,
    })
    .from(customers);

  const riskRows = await db
    .select({ level: customers.riskLevel, count: sql<number>`count(*)::int` })
    .from(customers)
    .groupBy(customers.riskLevel);

  const total = agg?.total ?? 0;
  const riskDistribution = RISK_ORDER.map((level) => {
    const count = riskRows.find((r) => r.level === level)?.count ?? 0;
    return { level, count, share: total ? r4(count / total) : 0 };
  });

  return {
    totalCustomers: total,
    churned: agg?.churned ?? 0,
    retained: total - (agg?.churned ?? 0),
    churnRate: total ? r4((agg?.churned ?? 0) / total) : 0,
    highRiskCustomers: agg?.highRisk ?? 0,
    veryHighRisk: agg?.veryHigh ?? 0,
    avgChurnProbability: r4(agg?.avgProb ?? 0),
    highRiskMonthlyRevenue: r2(agg?.highRiskRevenue ?? 0),
    totalMonthlyRevenue: r2(agg?.totalRevenue ?? 0),
    riskDistribution,
  };
}

export type GroupStat = {
  group: string;
  customers: number;
  churned: number;
  churnRate: number;
  avgProbability: number;
  highRisk: number;
  highRiskRate: number;
  avgViewingHours: number;
  avgMonthlyCharges: number;
};

type GroupCol = "subscriptionType" | "deviceRegistered" | "paymentMethod" | "contentType" | "accountAgeGroup" | "viewingCategory" | "engagementCategory" | "multiDeviceAccess" | "paperlessBilling" | "genrePreference";

export async function churnByGroup(col: GroupCol): Promise<GroupStat[]> {
  const c = customers[col];
  const rows = await db
    .select({
      group: c,
      customers: sql<number>`count(*)::int`,
      churned: sql<number>`sum(${customers.churn})::int`,
      avgProbability: sql<number>`avg(${customers.churnProbability})::float`,
      highRisk: sql<number>`sum(case when ${customers.riskLevel} in ('High','Very High') then 1 else 0 end)::int`,
      avgViewingHours: sql<number>`avg(${customers.viewingHoursPerWeek})::float`,
      avgMonthlyCharges: sql<number>`avg(${customers.monthlyCharges})::float`,
    })
    .from(customers)
    .groupBy(c);

  const stats = rows.map((r) => ({
    group: String(r.group),
    customers: r.customers,
    churned: r.churned,
    churnRate: r4(r.churned / r.customers),
    avgProbability: r4(r.avgProbability),
    highRisk: r.highRisk,
    highRiskRate: r4(r.highRisk / r.customers),
    avgViewingHours: r2(r.avgViewingHours),
    avgMonthlyCharges: r2(r.avgMonthlyCharges),
  }));

  // keep natural ordering for ordinal groups
  if (col === "accountAgeGroup") {
    const order = ACCOUNT_AGE_GROUPS.map((g) => g.label);
    stats.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  } else if (col === "viewingCategory") {
    const order = VIEWING_CATEGORIES.map((g) => g.label);
    stats.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  } else if (col === "engagementCategory") {
    const order = ["Low", "Medium", "High"];
    stats.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  } else if (col === "subscriptionType") {
    const order = ["Basic", "Standard", "Premium"];
    stats.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  } else {
    stats.sort((a, b) => b.churnRate - a.churnRate);
  }
  return stats;
}

export type BehaviourComparison = {
  metric: string;
  churned: number;
  retained: number;
};

export async function behaviourComparison(): Promise<BehaviourComparison[]> {
  const rows = await db
    .select({
      churn: customers.churn,
      viewing: sql<number>`avg(${customers.viewingHoursPerWeek})::float`,
      duration: sql<number>`avg(${customers.averageViewingDuration})::float`,
      downloads: sql<number>`avg(${customers.contentDownloadsPerMonth})::float`,
      watchlist: sql<number>`avg(${customers.watchlistSize})::float`,
      rating: sql<number>`avg(${customers.userRating})::float`,
      tickets: sql<number>`avg(${customers.supportTicketsPerMonth})::float`,
      accountAge: sql<number>`avg(${customers.accountAge})::float`,
      engagement: sql<number>`avg(${customers.engagementScore})::float`,
      charges: sql<number>`avg(${customers.monthlyCharges})::float`,
    })
    .from(customers)
    .groupBy(customers.churn);
  const c = rows.find((r) => r.churn === 1);
  const r = rows.find((r) => r.churn === 0);
  if (!c || !r) return [];
  const pairs: [string, keyof typeof c][] = [
    ["Viewing hours / week", "viewing"],
    ["Avg. viewing duration (min)", "duration"],
    ["Content downloads / month", "downloads"],
    ["Watchlist size", "watchlist"],
    ["User rating", "rating"],
    ["Support tickets / month", "tickets"],
    ["Account age (months)", "accountAge"],
    ["Engagement score", "engagement"],
    ["Monthly charges ($)", "charges"],
  ];
  return pairs.map(([metric, k]) => ({ metric, churned: r2(Number(c[k])), retained: r2(Number(r[k])) }));
}

/** Histogram of viewing hours for churned vs retained (bins of 4h). */
export async function viewingHistogram(): Promise<{ bin: string; churned: number; retained: number; churnRate: number }[]> {
  const rows = await db
    .select({
      bin: sql<number>`floor(${customers.viewingHoursPerWeek} / 4)::int`,
      churned: sql<number>`sum(${customers.churn})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(customers)
    .groupBy(sql`floor(${customers.viewingHoursPerWeek} / 4)`)
    .orderBy(sql`floor(${customers.viewingHoursPerWeek} / 4)`);
  return rows.map((r) => ({
    bin: `${r.bin * 4}-${r.bin * 4 + 4}h`,
    churned: r.churned,
    retained: r.total - r.churned,
    churnRate: r4(r.churned / r.total),
  }));
}

/** Churn rate by account-age month buckets of 6 months (for a smooth curve). */
export async function accountAgeCurve(): Promise<{ months: string; customers: number; churnRate: number; avgProbability: number }[]> {
  const rows = await db
    .select({
      bin: sql<number>`floor((${customers.accountAge}-1) / 6)::int`,
      churned: sql<number>`sum(${customers.churn})::int`,
      total: sql<number>`count(*)::int`,
      avgProb: sql<number>`avg(${customers.churnProbability})::float`,
    })
    .from(customers)
    .groupBy(sql`floor((${customers.accountAge}-1) / 6)`)
    .orderBy(sql`floor((${customers.accountAge}-1) / 6)`);
  return rows.map((r) => ({ months: `${r.bin * 6 + 1}-${r.bin * 6 + 6}`, customers: r.total, churnRate: r4(r.churned / r.total), avgProbability: r4(r.avgProb) }));
}

/** Segments = subscription × account-age group, ranked by predicted risk. */
export async function riskSegments(limit = 8) {
  const rows = await db
    .select({
      subscription: customers.subscriptionType,
      ageGroup: customers.accountAgeGroup,
      engagement: customers.engagementCategory,
      customers: sql<number>`count(*)::int`,
      avgProbability: sql<number>`avg(${customers.churnProbability})::float`,
      highRisk: sql<number>`sum(case when ${customers.riskLevel} in ('High','Very High') then 1 else 0 end)::int`,
      churnRate: sql<number>`avg(${customers.churn})::float`,
      revenue: sql<number>`sum(${customers.monthlyCharges})::float`,
    })
    .from(customers)
    .groupBy(customers.subscriptionType, customers.accountAgeGroup, customers.engagementCategory)
    .having(sql`count(*) >= 50`)
    .orderBy(desc(sql`avg(${customers.churnProbability})`))
    .limit(limit);
  return rows.map((r) => ({
    segment: `${r.subscription} · ${r.ageGroup} · ${r.engagement} engagement`,
    subscription: r.subscription,
    ageGroup: r.ageGroup,
    engagement: r.engagement,
    customers: r.customers,
    avgProbability: r4(r.avgProbability),
    highRisk: r.highRisk,
    highRiskRate: r4(r.highRisk / r.customers),
    observedChurnRate: r4(r.churnRate),
    monthlyRevenue: r2(r.revenue),
  }));
}

// ---------------------------------------------------------------------------
// Customer explorer
// ---------------------------------------------------------------------------

export type CustomerFilters = {
  risk?: string;
  subscription?: string;
  device?: string;
  ageGroup?: string;
  engagement?: string;
  payment?: string;
  minProb?: number;
  maxProb?: number;
  search?: string;
  sort?: "prob_desc" | "prob_asc" | "age_asc" | "viewing_asc";
  page?: number;
  pageSize?: number;
};

export async function listCustomers(f: CustomerFilters): Promise<{ rows: Customer[]; total: number; page: number; pageSize: number }> {
  const conds: SQL[] = [];
  if (f.risk && f.risk !== "all") conds.push(eq(customers.riskLevel, f.risk));
  if (f.subscription && f.subscription !== "all") conds.push(eq(customers.subscriptionType, f.subscription));
  if (f.device && f.device !== "all") conds.push(eq(customers.deviceRegistered, f.device));
  if (f.ageGroup && f.ageGroup !== "all") conds.push(eq(customers.accountAgeGroup, f.ageGroup));
  if (f.engagement && f.engagement !== "all") conds.push(eq(customers.engagementCategory, f.engagement));
  if (f.payment && f.payment !== "all") conds.push(eq(customers.paymentMethod, f.payment));
  if (typeof f.minProb === "number") conds.push(gte(customers.churnProbability, f.minProb));
  if (typeof f.maxProb === "number") conds.push(lte(customers.churnProbability, f.maxProb));
  if (f.search) conds.push(ilike(customers.customerId, `%${f.search.trim()}%`));

  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, f.pageSize ?? 25));
  const order =
    f.sort === "prob_asc" ? asc(customers.churnProbability) : f.sort === "age_asc" ? asc(customers.accountAge) : f.sort === "viewing_asc" ? asc(customers.viewingHoursPerWeek) : desc(customers.churnProbability);

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where);
  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(order, asc(customers.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: countRow?.n ?? 0, page, pageSize };
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const [row] = await db.select().from(customers).where(eq(customers.customerId, customerId.toUpperCase())).limit(1);
  return row ?? null;
}

export async function getFilterOptions() {
  const distinct = async (col: PgColumn) => (await db.selectDistinct({ v: col }).from(customers).orderBy(col)).map((r) => String(r.v));
  return {
    subscriptions: await distinct(customers.subscriptionType),
    devices: await distinct(customers.deviceRegistered),
    payments: await distinct(customers.paymentMethod),
    ageGroups: ACCOUNT_AGE_GROUPS.map((g) => g.label),
    engagement: ["Low", "Medium", "High"],
    risks: RISK_ORDER,
  };
}

export function customerToInput(c: Customer) {
  return {
    AccountAge: c.accountAge,
    MonthlyCharges: c.monthlyCharges,
    TotalCharges: c.totalCharges,
    ViewingHoursPerWeek: c.viewingHoursPerWeek,
    AverageViewingDuration: c.averageViewingDuration,
    ContentDownloadsPerMonth: c.contentDownloadsPerMonth,
    UserRating: c.userRating,
    SupportTicketsPerMonth: c.supportTicketsPerMonth,
    WatchlistSize: c.watchlistSize,
    SubscriptionType: c.subscriptionType,
    PaymentMethod: c.paymentMethod,
    PaperlessBilling: c.paperlessBilling,
    ContentType: c.contentType,
    MultiDeviceAccess: c.multiDeviceAccess,
    DeviceRegistered: c.deviceRegistered,
    GenrePreference: c.genrePreference,
    ParentalControl: c.parentalControl,
    SubtitlesEnabled: c.subtitlesEnabled,
  };
}

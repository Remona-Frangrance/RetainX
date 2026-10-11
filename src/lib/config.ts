/**
 * ChurnSense AI — product / business configuration.
 *
 * Everything in this file is a product decision, NOT a scientific constant.
 * Risk thresholds and grouping cut-offs can be tuned by the business.
 */

export type RiskLevel = "Low" | "Medium" | "High" | "Very High";

/** Churn-probability bands used to translate a score into a risk label. */
export const RISK_THRESHOLDS: { level: RiskLevel; min: number; max: number }[] = [
  { level: "Low", min: 0, max: 0.3 },
  { level: "Medium", min: 0.3, max: 0.6 },
  { level: "High", min: 0.6, max: 0.8 },
  { level: "Very High", min: 0.8, max: 1.0001 },
];

export const RISK_ORDER: RiskLevel[] = ["Low", "Medium", "High", "Very High"];

export const RISK_COLORS: Record<RiskLevel, string> = {
  Low: "#10b981",
  Medium: "#f59e0b",
  High: "#f97316",
  "Very High": "#ef4444",
};

export function riskLevelFor(p: number): RiskLevel {
  for (const band of RISK_THRESHOLDS) {
    if (p >= band.min && p < band.max) return band.level;
  }
  return "Very High";
}

/** Account-age groups (months) used for analytics. */
export const ACCOUNT_AGE_GROUPS: { label: string; min: number; max: number }[] = [
  { label: "0-6 mo", min: 0, max: 6 },
  { label: "6-12 mo", min: 6, max: 12 },
  { label: "12-24 mo", min: 12, max: 24 },
  { label: "24-48 mo", min: 24, max: 48 },
  { label: "48+ mo", min: 48, max: Infinity },
];

export function accountAgeGroupFor(months: number): string {
  for (const g of ACCOUNT_AGE_GROUPS) if (months >= g.min && months < g.max) return g.label;
  return "48+ mo";
}

/** Viewing categories (hours / week). Thresholds ≈ dataset terciles. */
export const VIEWING_CATEGORIES: { label: string; min: number; max: number }[] = [
  { label: "Low Viewer", min: 0, max: 12 },
  { label: "Moderate Viewer", min: 12, max: 25 },
  { label: "Heavy Viewer", min: 25, max: Infinity },
];

export function viewingCategoryFor(hours: number): string {
  for (const g of VIEWING_CATEGORIES) if (hours >= g.min && hours < g.max) return g.label;
  return "Heavy Viewer";
}

/** Engagement score (0-100 composite) categories. */
export function engagementCategoryFor(score: number): "Low" | "Medium" | "High" {
  if (score < 35) return "Low";
  if (score < 65) return "Medium";
  return "High";
}

// ---------------------------------------------------------------------------
// Feature schema (the actual dataset columns)
// ---------------------------------------------------------------------------

export const NUMERIC_FEATURES = [
  "AccountAge",
  "MonthlyCharges",
  "TotalCharges",
  "ViewingHoursPerWeek",
  "AverageViewingDuration",
  "ContentDownloadsPerMonth",
  "UserRating",
  "SupportTicketsPerMonth",
  "WatchlistSize",
] as const;

export const CATEGORICAL_FEATURES = {
  SubscriptionType: ["Basic", "Standard", "Premium"],
  PaymentMethod: ["Credit card", "Bank transfer", "Electronic check", "Mailed check"],
  PaperlessBilling: ["Yes", "No"],
  ContentType: ["Movies", "TV Shows", "Both"],
  MultiDeviceAccess: ["Yes", "No"],
  DeviceRegistered: ["TV", "Mobile", "Computer", "Tablet"],
  GenrePreference: ["Action", "Comedy", "Drama", "Sci-Fi", "Fantasy"],
  ParentalControl: ["Yes", "No"],
  SubtitlesEnabled: ["Yes", "No"],
} as const;

export type NumericFeature = (typeof NUMERIC_FEATURES)[number];
export type CategoricalFeature = keyof typeof CATEGORICAL_FEATURES;

/** Columns intentionally excluded from modelling. */
export const EXCLUDED_FROM_MODEL = {
  CustomerID: "identifier, no predictive meaning",
  Gender: "sensitive attribute — excluded to avoid encoding demographic bias",
  Churn: "target variable",
} as const;

/** Human-friendly labels for features. */
export const FEATURE_LABELS: Record<string, string> = {
  AccountAge: "Account age (months)",
  MonthlyCharges: "Monthly charges",
  TotalCharges: "Total charges",
  ViewingHoursPerWeek: "Viewing hours / week",
  AverageViewingDuration: "Avg. viewing duration (min)",
  ContentDownloadsPerMonth: "Content downloads / month",
  UserRating: "User rating",
  SupportTicketsPerMonth: "Support tickets / month",
  WatchlistSize: "Watchlist size",
  SubscriptionType: "Subscription type",
  PaymentMethod: "Payment method",
  PaperlessBilling: "Paperless billing",
  ContentType: "Content type",
  MultiDeviceAccess: "Multi-device access",
  DeviceRegistered: "Device registered",
  GenrePreference: "Genre preference",
  ParentalControl: "Parental control",
  SubtitlesEnabled: "Subtitles enabled",
};

export type CustomerInput = {
  [K in NumericFeature]: number;
} & {
  [K in CategoricalFeature]: string;
};

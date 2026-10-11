import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Streaming customer records. The 21 "dataset" columns mirror the schema of the
 * streaming/OTT churn dataset described in the project brief. The remaining
 * columns are engineered analytics fields and model outputs produced by the
 * ChurnSense pipeline.
 */
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    customerId: varchar("customer_id", { length: 32 }).notNull().unique(),

    // ---- raw dataset columns -------------------------------------------
    accountAge: integer("account_age").notNull(), // months
    monthlyCharges: real("monthly_charges").notNull(),
    totalCharges: real("total_charges").notNull(),
    subscriptionType: varchar("subscription_type", { length: 16 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull(),
    paperlessBilling: varchar("paperless_billing", { length: 4 }).notNull(),
    contentType: varchar("content_type", { length: 16 }).notNull(),
    multiDeviceAccess: varchar("multi_device_access", { length: 4 }).notNull(),
    deviceRegistered: varchar("device_registered", { length: 16 }).notNull(),
    viewingHoursPerWeek: real("viewing_hours_per_week").notNull(),
    averageViewingDuration: real("average_viewing_duration").notNull(), // minutes
    contentDownloadsPerMonth: integer("content_downloads_per_month").notNull(),
    genrePreference: varchar("genre_preference", { length: 16 }).notNull(),
    userRating: real("user_rating").notNull(),
    supportTicketsPerMonth: integer("support_tickets_per_month").notNull(),
    gender: varchar("gender", { length: 8 }).notNull(),
    watchlistSize: integer("watchlist_size").notNull(),
    parentalControl: varchar("parental_control", { length: 4 }).notNull(),
    subtitlesEnabled: varchar("subtitles_enabled", { length: 4 }).notNull(),
    churn: integer("churn").notNull(), // 0 / 1 (observed label)

    // ---- engineered analytics fields ------------------------------------
    engagementScore: real("engagement_score").notNull(), // 0-100 composite
    engagementCategory: varchar("engagement_category", { length: 8 }).notNull(),
    accountAgeGroup: varchar("account_age_group", { length: 16 }).notNull(),
    viewingCategory: varchar("viewing_category", { length: 16 }).notNull(),
    split: varchar("split", { length: 8 }).notNull(), // train / test

    // ---- model outputs ----------------------------------------------------
    churnProbability: real("churn_probability").notNull().default(0),
    riskLevel: varchar("risk_level", { length: 12 }).notNull().default("Low"),
  },
  (t) => [
    index("customers_prob_idx").on(t.churnProbability),
    index("customers_risk_idx").on(t.riskLevel),
    index("customers_sub_idx").on(t.subscriptionType),
  ],
);

/** Trained model artefacts + evaluation results (one row per algorithm). */
export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  algorithm: varchar("algorithm", { length: 32 }).notNull(),
  isFinal: boolean("is_final").notNull().default(false),
  metrics: jsonb("metrics").notNull(),
  params: jsonb("params").notNull(),
  featureImportance: jsonb("feature_importance").notNull(),
  trainingInfo: jsonb("training_info").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type ModelRow = typeof models.$inferSelect;

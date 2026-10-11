import "dotenv/config";
import { Client } from "pg";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to Supabase PostgreSQL.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id serial PRIMARY KEY,
      customer_id varchar(32) NOT NULL UNIQUE,
      account_age integer NOT NULL,
      monthly_charges real NOT NULL,
      total_charges real NOT NULL,
      subscription_type varchar(16) NOT NULL,
      payment_method varchar(32) NOT NULL,
      paperless_billing varchar(4) NOT NULL,
      content_type varchar(16) NOT NULL,
      multi_device_access varchar(4) NOT NULL,
      device_registered varchar(16) NOT NULL,
      viewing_hours_per_week real NOT NULL,
      average_viewing_duration real NOT NULL,
      content_downloads_per_month integer NOT NULL,
      genre_preference varchar(16) NOT NULL,
      user_rating real NOT NULL,
      support_tickets_per_month integer NOT NULL,
      gender varchar(8) NOT NULL,
      watchlist_size integer NOT NULL,
      parental_control varchar(4) NOT NULL,
      subtitles_enabled varchar(4) NOT NULL,
      churn integer NOT NULL,
      engagement_score real NOT NULL,
      engagement_category varchar(8) NOT NULL,
      account_age_group varchar(16) NOT NULL,
      viewing_category varchar(16) NOT NULL,
      split varchar(8) NOT NULL,
      churn_probability real NOT NULL DEFAULT 0,
      risk_level varchar(12) NOT NULL DEFAULT 'Low'
    );

    CREATE INDEX IF NOT EXISTS customers_prob_idx ON customers (churn_probability);
    CREATE INDEX IF NOT EXISTS customers_risk_idx ON customers (risk_level);
    CREATE INDEX IF NOT EXISTS customers_sub_idx ON customers (subscription_type);

    CREATE TABLE IF NOT EXISTS models (
      id serial PRIMARY KEY,
      name varchar(64) NOT NULL,
      algorithm varchar(32) NOT NULL,
      is_final boolean NOT NULL DEFAULT false,
      metrics jsonb NOT NULL,
      params jsonb NOT NULL,
      feature_importance jsonb NOT NULL,
      training_info jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log("Database schema successfully pushed to Supabase!");
  await client.end();
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

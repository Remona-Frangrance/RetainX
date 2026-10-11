/**
 * Seeded synthetic streaming-customer dataset generator.
 *
 * IMPORTANT: this data is SYNTHETIC. It mirrors the 21-column schema of the
 * streaming/OTT churn dataset described in the project brief (CustomerID,
 * AccountAge, MonthlyCharges, TotalCharges, SubscriptionType, PaymentMethod,
 * PaperlessBilling, ContentType, MultiDeviceAccess, DeviceRegistered,
 * ViewingHoursPerWeek, AverageViewingDuration, ContentDownloadsPerMonth,
 * GenrePreference, UserRating, SupportTicketsPerMonth, Gender, WatchlistSize,
 * ParentalControl, SubtitlesEnabled, Churn) but contains no real customer data.
 *
 * The churn label is drawn from a latent-risk model containing both linear and
 * non-linear structure (tenure cliff, engagement interactions, noise) so that
 * the model comparison is genuinely informative rather than rigged.
 */

import { CATEGORICAL_FEATURES } from "@/lib/config";

export type RawRecord = {
  CustomerID: string;
  AccountAge: number;
  MonthlyCharges: number;
  TotalCharges: number;
  SubscriptionType: string;
  PaymentMethod: string;
  PaperlessBilling: string;
  ContentType: string;
  MultiDeviceAccess: string;
  DeviceRegistered: string;
  ViewingHoursPerWeek: number;
  AverageViewingDuration: number;
  ContentDownloadsPerMonth: number;
  GenrePreference: string;
  UserRating: number;
  SupportTicketsPerMonth: number;
  Gender: string;
  WatchlistSize: number;
  ParentalControl: string;
  SubtitlesEnabled: string;
  Churn: number;
};

/** Mulberry32 PRNG — small, fast, deterministic. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pick = <T>(arr: readonly T[], weights?: readonly number[]): T => {
    if (!weights) return arr[Math.floor(next() * arr.length)];
    const total = weights.reduce((s, w) => s + w, 0);
    let r = next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return { next, normal, pick, int };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function generateDataset(n: number, seed = 42): RawRecord[] {
  const rng = makeRng(seed);
  const C = CATEGORICAL_FEATURES;
  const out: RawRecord[] = [];

  for (let i = 0; i < n; i++) {
    const subscriptionType = rng.pick(C.SubscriptionType, [0.36, 0.33, 0.31]);
    const paymentMethod = rng.pick(C.PaymentMethod, [0.3, 0.24, 0.26, 0.2]);
    const paperless = rng.pick(C.PaperlessBilling, [0.58, 0.42]);
    const contentType = rng.pick(C.ContentType, [0.34, 0.33, 0.33]);
    const multiDevice = rng.pick(C.MultiDeviceAccess, [0.5, 0.5]);
    const device = rng.pick(C.DeviceRegistered, [0.28, 0.3, 0.22, 0.2]);
    const genre = rng.pick(C.GenrePreference);
    const parental = rng.pick(C.ParentalControl, [0.5, 0.5]);
    const subtitles = rng.pick(C.SubtitlesEnabled, [0.5, 0.5]);
    const gender = rng.pick(["Male", "Female"] as const);

    // Tenure: mixture of newer and long-standing accounts (1-120 months)
    const accountAge = clamp(
      Math.round(rng.next() < 0.35 ? 1 + Math.abs(rng.normal()) * 14 : 6 + rng.next() * 114),
      1,
      120,
    );

    const baseCharge = subscriptionType === "Basic" ? 8.5 : subscriptionType === "Standard" ? 12.5 : 16.5;
    const monthlyCharges = round(clamp(baseCharge + rng.normal() * 2.2, 4.99, 19.99));
    const totalCharges = round(monthlyCharges * accountAge * clamp(1 + rng.normal() * 0.05, 0.85, 1.15));

    // Latent engagement propensity drives several behavioural columns
    const latentEng = rng.normal();
    const viewingHours = round(clamp(20 + latentEng * 7.5 + rng.normal() * 5.5, 1, 40), 1);
    const avgDuration = round(clamp(90 + latentEng * 25 + rng.normal() * 35, 5, 180), 1);
    const downloads = clamp(Math.round(20 + latentEng * 8 + rng.normal() * 11), 0, 49);
    const watchlist = clamp(Math.round(12 + latentEng * 4 + rng.normal() * 6), 0, 24);
    const userRating = round(clamp(3.1 + latentEng * 0.35 + rng.normal() * 1.0, 1, 5), 1);
    const supportTickets = clamp(Math.round(Math.abs(rng.normal()) * 2.4 + (latentEng < -0.8 ? 1 : 0)), 0, 9);

    // ---- latent churn risk (association structure, mixed linear/non-linear)
    let z = -2.4;
    z += -0.055 * (viewingHours - 20); // lower viewing -> higher risk
    z += -0.006 * (avgDuration - 90);
    z += -0.012 * (downloads - 20);
    z += -0.02 * (watchlist - 12);
    z += -0.22 * (userRating - 3.1);
    z += 0.14 * supportTickets;
    z += -0.011 * (accountAge - 50); // longer tenure -> lower risk
    if (accountAge <= 6) z += 0.55; // early-tenure cliff (non-linear)
    else if (accountAge <= 12) z += 0.3;
    z += subscriptionType === "Basic" ? 0.16 : subscriptionType === "Premium" ? -0.14 : 0;
    z += paymentMethod === "Electronic check" ? 0.2 : paymentMethod === "Mailed check" ? 0.1 : 0;
    z += paperless === "Yes" ? 0.08 : 0;
    z += multiDevice === "Yes" ? -0.12 : 0;
    z += device === "Mobile" ? 0.1 : device === "TV" ? -0.08 : 0;
    z += 0.03 * (monthlyCharges - 12.5);
    // interaction: low viewing on Basic is especially risky
    if (subscriptionType === "Basic" && viewingHours < 10) z += 0.35;
    // interaction: heavy viewers with many tickets are still fairly safe
    if (viewingHours > 28 && supportTickets >= 4) z -= 0.25;
    z += rng.normal() * 0.55; // unobserved noise

    const churn = rng.next() < sigmoid(z) ? 1 : 0;

    out.push({
      CustomerID: `C${String(100001 + i)}`,
      AccountAge: accountAge,
      MonthlyCharges: monthlyCharges,
      TotalCharges: totalCharges,
      SubscriptionType: subscriptionType,
      PaymentMethod: paymentMethod,
      PaperlessBilling: paperless,
      ContentType: contentType,
      MultiDeviceAccess: multiDevice,
      DeviceRegistered: device,
      ViewingHoursPerWeek: viewingHours,
      AverageViewingDuration: avgDuration,
      ContentDownloadsPerMonth: downloads,
      GenrePreference: genre,
      UserRating: userRating,
      SupportTicketsPerMonth: supportTickets,
      Gender: gender,
      WatchlistSize: watchlist,
      ParentalControl: parental,
      SubtitlesEnabled: subtitles,
      Churn: churn,
    });
  }
  return out;
}

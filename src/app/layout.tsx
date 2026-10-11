import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "RetainX — Autonomous Churn & Retention Intelligence",
  description: "Explainable customer churn prediction and retention analytics for streaming subscription businesses.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans text-slate-200">
        {/* Animated background grid */}
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(99,102,241,0.08) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 75%)",
          }}
        />
        {/* Scanline overlay for depth */}
        <div
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.015]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)",
          }}
        />
        <div className="relative z-[1] flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1">
              <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
            </main>
            <footer className="px-6 pb-6 text-center text-[11px] text-slate-500">
              RetainX · Predictions are model-estimated churn risk and should support, not replace, business decision-making.
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayGuard | Zero-Trust Cryptographic Safety Layer for Agentic Commerce",
  description:
    "Deterministic Policy Firewall, 30s Single-Use Nonce HMAC-SHA256 Step-Up Engine, PayPal Orders v2 Sandbox Integration, and AG Grid Real-Time Security Audit Ledger.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#060b16] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-sky-200">
        {children}
      </body>
    </html>
  );
}

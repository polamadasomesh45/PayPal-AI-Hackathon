import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PayGuard | Zero-Trust Cryptographic Policy Firewall for Agentic Commerce",
  description:
    "Deterministic Policy Firewall, 30s Single-Use Nonce HMAC-SHA256 Step-Up Engine, PayPal Orders v2 Sandbox Settlement, and AG Grid Security Audit Ledger.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="min-h-screen bg-[#090b10] text-slate-100 antialiased selection:bg-[#0066cc]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}

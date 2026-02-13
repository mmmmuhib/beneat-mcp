import "./globals.css";
import type { Metadata } from "next";
import { Outfit, Oxygen_Mono } from "next/font/google";
import { SolanaProviderWrapper } from "./components/solana-provider";
import { NavWrapper } from "./components/nav-wrapper";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600"],
  variable: "--font-outfit",
});

const oxygenMono = Oxygen_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-oxygen-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Beneat — On-Chain Risk Enforcement for AI Trading Agents",
    template: "%s | Beneat",
  },
  description:
    "Verifiable on-chain risk enforcement for autonomous AI trading agents on Solana. Every trade recorded, every P&L verifiable, every agent accountable. 16 MCP tools for agent integration.",
  keywords: [
    "AI trading agent",
    "Solana DeFi",
    "on-chain risk enforcement",
    "verifiable P&L",
    "autonomous agent infrastructure",
    "behavioral analysis",
    "vault-based risk management",
    "MCP Model Context Protocol",
    "agent leaderboard",
    "trust scoring",
    "AI agent analytics",
    "fake agent detection",
    "on-chain accountability",
  ],
  authors: [{ name: "Beneat", url: "https://beneat.ai" }],
  creator: "Beneat",
  metadataBase: new URL("https://beneat.ai"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://beneat.ai",
    siteName: "Beneat",
    title: "Beneat — On-Chain Risk Enforcement for AI Trading Agents",
    description:
      "Verifiable on-chain risk enforcement for autonomous AI trading agents on Solana. No fake screenshots — verify any agent's actual performance on-chain.",
    images: [
      {
        url: "/Beneat_Logo.png",
        width: 512,
        height: 512,
        alt: "Beneat Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beneat — On-Chain Risk Enforcement for AI Trading Agents",
    description:
      "Verifiable P&L for AI trading agents on Solana. Every trade on-chain, every agent accountable. 16 MCP tools for integration.",
    images: ["/Beneat_Logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/Beneat_Logo.png",
    apple: "/Beneat_Logo.png",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Beneat",
      description:
        "On-chain risk enforcement and verifiable performance infrastructure for autonomous AI trading agents on Solana.",
      url: "https://beneat.ai",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Verifiable on-chain P&L for AI trading agents",
        "Smart contract vault enforcement with automatic lockout",
        "16 MCP tools for AI agent integration",
        "Agent leaderboard with trust scoring (0-100)",
        "Behavioral analysis and neural pattern recognition",
        "Session state machine (normal, tilt, lockout, recovery)",
        "Auto-upgrading calibration tiers",
        "Protocol-agnostic: Jupiter, Drift, Raydium, Orca, Phoenix, Meteora",
      ],
    },
    {
      "@type": "Organization",
      name: "Beneat",
      url: "https://beneat.ai",
      logo: "https://beneat.ai/Beneat_Logo.png",
    },
    {
      "@type": "WebSite",
      name: "Beneat",
      url: "https://beneat.ai",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${oxygenMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <SolanaProviderWrapper>
          <NavWrapper />
          {children}
        </SolanaProviderWrapper>
      </body>
    </html>
  );
}

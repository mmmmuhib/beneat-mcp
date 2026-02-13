import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { analyzeAgent, type AgentTradeProfile } from "../../lib/trade-analyzer";

const AGENT_TRADES_DIR = join(process.cwd(), "data", "agent-trades");

function loadFundingUsdc(csvFilename: string): number | undefined {
  const fundingFile = csvFilename.replace(/-trade-history.*\.csv$/i, "-funding.json");
  const fundingPath = join(AGENT_TRADES_DIR, fundingFile);
  if (!existsSync(fundingPath)) return undefined;
  try {
    const data = JSON.parse(readFileSync(fundingPath, "utf-8"));
    return typeof data.totalFundingUsdc === "number" ? data.totalFundingUsdc : undefined;
  } catch {
    return undefined;
  }
}

function loadProfiles(): AgentTradeProfile[] {
  let files: string[];
  try {
    files = readdirSync(AGENT_TRADES_DIR).filter((f) =>
      f.toLowerCase().endsWith(".csv")
    );
  } catch {
    return [];
  }

  const profiles: AgentTradeProfile[] = [];
  for (const file of files) {
    try {
      const csv = readFileSync(join(AGENT_TRADES_DIR, file), "utf-8");
      const fundingUsdc = loadFundingUsdc(file);
      const profile = analyzeAgent(csv, file, undefined, fundingUsdc);
      if (profile.totalTrades > 0) {
        profiles.push(profile);
      }
    } catch {
      continue;
    }
  }

  const hlProfiles = profiles.filter((p) => p.source === "hyperliquid");
  hlProfiles.sort((a, b) => b.totalTrades - a.totalTrades);
  return hlProfiles;
}

export async function GET() {
  const profiles = loadProfiles();
  return NextResponse.json({ agents: profiles, count: profiles.length });
}

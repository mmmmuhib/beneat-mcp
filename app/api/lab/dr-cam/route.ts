import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { analyzeAgent, type AgentTradeProfile } from "../../../lib/trade-analyzer";
import { runDRCAMAnalysis, type DRCAMResult } from "../../../lib/dr-cam";

const AGENT_TRADES_DIR = join(process.cwd(), "data", "agent-trades");

/** Cache DR-CAM results for 60 seconds (same as leaderboard) */
let cache: { data: DRCAMResult[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

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
    files = readdirSync(AGENT_TRADES_DIR).filter(
      (f) => f.toLowerCase().endsWith(".csv") && f.toLowerCase().startsWith("hyperliquid-"),
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

  profiles.sort((a, b) => b.totalTrades - a.totalTrades);
  return profiles;
}

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      agents: cache.data,
      count: cache.data.length,
      cached: true,
    });
  }

  const profiles = loadProfiles();
  const results: DRCAMResult[] = [];

  for (const profile of profiles) {
    try {
      const result = runDRCAMAnalysis(profile);
      results.push(result);
    } catch {
      continue;
    }
  }

  cache = { data: results, timestamp: Date.now() };

  return NextResponse.json({
    agents: results,
    count: results.length,
    cached: false,
  });
}

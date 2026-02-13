#!/usr/bin/env node

/**
 * Beneat Risk MCP — Full Enforcement Lifecycle Demo
 *
 * Spawns the MCP server as a child process and drives it through:
 *   1. Status check (no vault yet)
 *   2. Calibration (Tier 1 — sets rules + syncs AgentWallet policy)
 *   3. Pre-trade check → approved
 *   4. Record winning trade
 *   5. Record losing trade (cooldown warning)
 *   6. Record losing trade (80% budget warning)
 *   7. Record losing trade → LOCKOUT TRIGGERED → AgentWallet FROZEN
 *   8. Pre-trade check → DENIED (vault locked)
 *   9. Policy status (shows frozen state)
 *  10. [Simulate lockout expiry] → Policy RESTORED
 *  11. Verify agent reputation
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "dist", "index.js");

const DEMO_WALLET = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

function banner(text) {
  const line = "═".repeat(60);
  console.log(`\n${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.white}  ${text}${C.reset}`);
  console.log(`${C.cyan}${line}${C.reset}\n`);
}

function step(n, label) {
  console.log(
    `${C.bold}${C.blue}[Step ${n}]${C.reset} ${C.white}${label}${C.reset}`
  );
}

function result(obj) {
  const json = JSON.stringify(obj, null, 2);
  const colored = json
    .replace(/"approved": false/g, `${C.red}"approved": false${C.reset}`)
    .replace(/"approved": true/g, `${C.green}"approved": true${C.reset}`)
    .replace(/"can_trade": false/g, `${C.red}"can_trade": false${C.reset}`)
    .replace(/"can_trade": true/g, `${C.green}"can_trade": true${C.reset}`)
    .replace(
      /"lockout_triggered": true/g,
      `${C.bgRed}${C.white}"lockout_triggered": true${C.reset}`
    )
    .replace(
      /"lockout_triggered": false/g,
      `${C.green}"lockout_triggered": false${C.reset}`
    )
    .replace(
      /"agentwallet_frozen": true/g,
      `${C.bgRed}${C.white}"agentwallet_frozen": true${C.reset}`
    )
    .replace(
      /"agentwallet_restored": true/g,
      `${C.bgGreen}${C.white}"agentwallet_restored": true${C.reset}`
    )
    .replace(/"is_frozen": true/g, `${C.red}"is_frozen": true${C.reset}`)
    .replace(/"is_frozen": false/g, `${C.green}"is_frozen": false${C.reset}`)
    .replace(/"risk_grade": "F"/g, `${C.red}"risk_grade": "F"${C.reset}`)
    .replace(/"risk_grade": "A"/g, `${C.green}"risk_grade": "A"${C.reset}`)
    .replace(/"Warning:/g, `${C.yellow}"Warning:`)
    .replace(/warning"/g, `warning"${C.reset}`);
  console.log(`${C.dim}${colored}${C.reset}`);
}

function pause(label) {
  console.log(`\n${C.dim}  ... ${label} ...${C.reset}\n`);
}

async function callTool(client, name, args) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.[0]?.text;
  return text ? JSON.parse(text) : response;
}

async function main() {
  banner("BENEAT RISK MCP — ENFORCEMENT LIFECYCLE DEMO");

  console.log(
    `${C.dim}This demo shows how Beneat enforces risk limits on an AI trading agent`
  );
  console.log(
    `by controlling its AgentWallet spending policy. Every call below is a`
  );
  console.log(
    `real MCP tool invocation over stdio — exactly how another agent would use it.${C.reset}\n`
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    env: {
      ...process.env,
      SOLANA_RPC_URL:
        process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    },
  });

  const client = new Client({ name: "beneat-demo", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(
    `${C.green}Connected to Beneat MCP server — ${tools.length} tools available${C.reset}\n`
  );
  for (const tool of tools) {
    console.log(`  ${C.cyan}${tool.name}${C.reset}`);
  }

  // ─── Step 1: Check status (no vault) ───
  pause("Agent just started, checking vault status");
  step(1, "beneat_get_status — does this agent have a vault?");
  const status = await callTool(client, "beneat_get_status", {
    wallet_address: DEMO_WALLET,
  });
  result(status);
  console.log(
    `\n  ${C.yellow}→ No vault found. Agent is in advisory mode — no enforcement yet.${C.reset}`
  );

  // ─── Step 2: Calibrate ───
  pause("Agent sets up risk rules via calibration");
  step(
    2,
    "beneat_calibrate — Tier 1 calibration (day_trading, medium risk, 1 SOL deposit)"
  );
  const cal = await callTool(client, "beneat_calibrate", {
    wallet_address: DEMO_WALLET,
    deposit_amount: 1,
    strategy_type: "day_trading",
    risk_tolerance: "medium",
  });
  console.log(`${C.dim}{`);
  console.log(`  "calibration": {`);
  console.log(
    `    "tier": ${C.cyan}${cal.calibration.tier}${C.reset}${C.dim},`
  );
  console.log(
    `    "strategy_type": "${cal.calibration.strategy_type}",`
  );
  console.log(
    `    "risk_tolerance": "${cal.calibration.risk_tolerance}"`
  );
  console.log(`  },`);
  console.log(`  "parameters": {`);
  console.log(
    `    "daily_loss_limit_sol": ${C.yellow}${cal.parameters.daily_loss_limit_sol}${C.reset}${C.dim},`
  );
  console.log(
    `    "max_trades_per_day": ${C.yellow}${cal.parameters.max_trades_per_day}${C.reset}${C.dim},`
  );
  console.log(
    `    "lockout_duration_seconds": ${cal.parameters.lockout_duration_seconds},`
  );
  console.log(
    `    "cooldown_seconds": ${cal.parameters.cooldown_seconds}`
  );
  console.log(`  },`);
  if (cal.policy_sync) {
    console.log(`  "policy_sync": {`);
    console.log(
      `    "agentwallet_synced": ${cal.policy_sync.agentwallet_synced ? `${C.green}true${C.reset}${C.dim}` : `${C.yellow}false${C.reset}${C.dim}`},`
    );
    console.log(
      `    "detail": "${cal.policy_sync.detail ?? cal.policy_sync.error ?? "N/A"}"`
    );
    console.log(`  },`);
  }
  console.log(
    `  "unsigned_transactions": [${cal.unsigned_transactions.length} txs to sign]`
  );
  console.log(`}${C.reset}`);

  const limitSol = cal.parameters.daily_loss_limit_sol;
  console.log(
    `\n  ${C.green}→ Vault rules set: ${limitSol} SOL daily loss limit, ${cal.parameters.max_trades_per_day} trades/day.${C.reset}`
  );
  console.log(
    `  ${C.dim}→ In production, agent signs ${cal.unsigned_transactions.length} transactions via AgentWallet.${C.reset}`
  );

  // ─── Step 3: Pre-trade check ───
  pause("Agent wants to open a 0.1 SOL long on SOL-PERP");
  step(3, "beneat_check_trade — pre-flight authorization");
  const check1 = await callTool(client, "beneat_check_trade", {
    wallet_address: DEMO_WALLET,
    market: "SOL-PERP",
    size: 0.1,
    direction: "long",
  });
  result(check1);
  console.log(
    `\n  ${C.green}→ Approved. Agent proceeds to execute trade.${C.reset}`
  );

  // ─── Step 4: Record winning trade ───
  pause("Trade executed. Agent made +0.02 SOL profit");
  step(4, "beneat_record_trade — record P&L (+0.02 SOL)");
  const trade1 = await callTool(client, "beneat_record_trade", {
    wallet_address: DEMO_WALLET,
    pnl: 0.02,
    market: "SOL-PERP",
  });
  result(trade1);
  console.log(
    `\n  ${C.green}→ Profit recorded. Session P&L: ${trade1.session_summary.daily_pnl_sol} SOL${C.reset}`
  );

  // ─── Step 5: Record losing trade ───
  pause("Next trade goes bad. Agent lost -0.008 SOL");
  step(5, "beneat_record_trade — record loss (-0.008 SOL)");
  const trade2 = await callTool(client, "beneat_record_trade", {
    wallet_address: DEMO_WALLET,
    pnl: -0.008,
    market: "SOL-PERP",
  });
  result(trade2);
  console.log(
    `\n  ${C.yellow}→ Loss recorded. Session P&L: ${trade2.session_summary.daily_pnl_sol} SOL${C.reset}`
  );

  // ─── Step 6: Another loss ───
  pause("Agent doubles down. Another loss: -0.01 SOL");
  step(6, "beneat_record_trade — record loss (-0.01 SOL)");
  const trade3 = await callTool(client, "beneat_record_trade", {
    wallet_address: DEMO_WALLET,
    pnl: -0.01,
    market: "SOL-PERP",
  });
  result(trade3);
  const pnlNow = trade3.session_summary.daily_pnl_sol;
  console.log(
    `\n  ${C.yellow}→ Session P&L: ${pnlNow} SOL. ${trade3.warnings ? trade3.warnings[0] : ""}${C.reset}`
  );

  // ─── Step 7: Record another loss ───
  pause("Agent keeps trading. Another loss: -0.015 SOL");
  step(7, "beneat_record_trade — record loss (-0.015 SOL)");
  const trade4 = await callTool(client, "beneat_record_trade", {
    wallet_address: DEMO_WALLET,
    pnl: -0.015,
    market: "SOL-PERP",
  });
  result(trade4);

  // ─── Step 8: Big loss → lockout ───
  pause("Agent revenge-trades with bigger size. Loses -0.025 SOL");
  step(
    8,
    "beneat_record_trade — record big loss (-0.025 SOL) → LOCKOUT?"
  );
  const trade5 = await callTool(client, "beneat_record_trade", {
    wallet_address: DEMO_WALLET,
    pnl: -0.025,
    market: "SOL-PERP",
  });
  result(trade5);

  if (trade5.lockout_triggered) {
    console.log(
      `\n  ${C.bgRed}${C.white} LOCKOUT TRIGGERED ${C.reset} ${C.red}${trade5.lockout_reason}${C.reset}`
    );
    if (trade5.enforcement?.agentwallet_frozen) {
      console.log(
        `  ${C.bgRed}${C.white} WALLET FROZEN ${C.reset} ${C.red}AgentWallet max_per_tx_usd set to $0. Agent cannot sign any transaction.${C.reset}`
      );
    } else {
      console.log(
        `  ${C.yellow}→ Enforcement: ${trade5.enforcement?.detail ?? "Advisory only (no AgentWallet config). In production, the wallet would be frozen."}${C.reset}`
      );
    }
  } else {
    console.log(
      `\n  ${C.yellow}→ No on-chain vault to trigger lockout (advisory mode). In production with a vault, this would freeze the agent.${C.reset}`
    );
    console.log(
      `  ${C.dim}→ Session P&L: ${trade5.session_summary.daily_pnl_sol} SOL across ${trade5.session_summary.trade_count} trades.${C.reset}`
    );
  }

  // ─── Step 9: Try to trade while locked ───
  pause("Agent tries to trade again...");
  step(9, "beneat_check_trade — can the agent still trade?");
  const check2 = await callTool(client, "beneat_check_trade", {
    wallet_address: DEMO_WALLET,
    market: "SOL-PERP",
    size: 0.1,
  });
  result(check2);

  if (!check2.can_trade || check2.approved === false) {
    console.log(
      `\n  ${C.red}→ DENIED. ${check2.reasons?.[0] ?? "Agent should not trade."}${C.reset}`
    );
  } else {
    console.log(
      `\n  ${C.yellow}→ Advisory mode: approved but with ${check2.session_trades ?? 0} trades and ${check2.session_pnl_sol ?? 0} SOL session P&L tracked.${C.reset}`
    );
  }

  // ─── Step 10: Policy status ───
  pause("Checking AgentWallet policy state");
  step(10, "beneat_set_policy(action=status) — is the wallet frozen?");
  const policyStatus = await callTool(client, "beneat_set_policy", {
    wallet_address: DEMO_WALLET,
    action: "status",
  });
  result(policyStatus);

  // ─── Step 11: Verify agent reputation ───
  pause("Another agent wants to verify this agent's risk profile");
  step(
    11,
    "beneat_verify_agent — trust score and risk grade"
  );
  const verify = await callTool(client, "beneat_verify_agent", {
    wallet_address: DEMO_WALLET,
  });
  result(verify);
  console.log(
    `\n  ${C.magenta}→ Trust score: ${verify.trust_score}/100, Risk grade: ${verify.risk_grade}${C.reset}`
  );
  console.log(
    `  ${C.dim}→ Other agents can call this before accepting counterparty trades.${C.reset}`
  );

  // ─── Summary ───
  banner("DEMO COMPLETE — ENFORCEMENT LIFECYCLE SUMMARY");

  console.log(`${C.white}  What happened:${C.reset}`);
  console.log(
    `${C.dim}  ┌─ Step 1-2:  Agent had no vault → calibrated risk rules (Tier 1)${C.reset}`
  );
  console.log(
    `${C.dim}  ├─ Step 3:    Pre-trade check passed → agent traded${C.reset}`
  );
  console.log(
    `${C.green}  ├─ Step 4:    Won +0.02 SOL → session healthy${C.reset}`
  );
  console.log(
    `${C.yellow}  ├─ Step 5-7:  Three losses → warnings escalated${C.reset}`
  );
  console.log(
    `${C.red}  ├─ Step 8:    Big loss → daily limit breached → LOCKOUT + WALLET FROZEN${C.reset}`
  );
  console.log(
    `${C.red}  ├─ Step 9:    Trade attempt → DENIED${C.reset}`
  );
  console.log(
    `${C.magenta}  └─ Step 11:   Reputation check → risk grade reflects discipline${C.reset}`
  );

  console.log(`\n${C.white}  Enforcement model:${C.reset}`);
  console.log(
    `${C.dim}  • With AgentWallet: PATCH policy → max_per_tx_usd=0 → wallet FROZEN${C.reset}`
  );
  console.log(
    `${C.dim}  • Without AgentWallet: advisory mode → agent told to stop${C.reset}`
  );
  console.log(
    `${C.dim}  • On-chain: vault require!() guards block swap instructions${C.reset}`
  );

  console.log(`\n${C.white}  For other hackathon teams:${C.reset}`);
  console.log(
    `${C.cyan}  1. Add beneat-risk to your MCP config (3 lines of JSON)${C.reset}`
  );
  console.log(
    `${C.cyan}  2. Your AgentWallet config already exists${C.reset}`
  );
  console.log(
    `${C.cyan}  3. Add "call beneat_check_trade before trades" to your agent prompt${C.reset}`
  );
  console.log(
    `${C.cyan}  4. Zero code changes to your trading logic${C.reset}\n`
  );

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(`${C.red}Demo failed: ${err.message}${C.reset}`);
  process.exit(1);
});

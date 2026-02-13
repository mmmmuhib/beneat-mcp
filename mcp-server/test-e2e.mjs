#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "dist", "index.js");

const WALLET = process.env.TEST_WALLET ?? "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function callTool(client, name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.[0]?.text;
  const parsed = text ? JSON.parse(text) : {};
  return {
    data: parsed,
    isError: response.isError === true,
    structuredContent: response.structuredContent ?? null,
  };
}

async function runTest(client, name, toolName, args, validate, { allowError = false } = {}) {
  const start = Date.now();
  try {
    const { data, isError, structuredContent } = await callTool(client, toolName, args);

    if (isError && !allowError) {
      throw new Error(`Tool returned isError: ${data.error ?? JSON.stringify(data)}`);
    }

    if (!isError && data.error && !allowError) {
      throw new Error(`Tool returned error in body: ${data.error}`);
    }

    validate(data, { isError, structuredContent });

    const elapsed = Date.now() - start;
    passed++;
    results.push({ name, status: "PASS", elapsed });
    console.log(`  ${C.green}PASS${C.reset} ${name} ${C.dim}(${elapsed}ms)${C.reset}`);
    return data;
  } catch (err) {
    const elapsed = Date.now() - start;
    failed++;
    results.push({ name, status: "FAIL", elapsed, error: err.message });
    console.log(`  ${C.red}FAIL${C.reset} ${name} ${C.dim}(${elapsed}ms)${C.reset}`);
    console.log(`       ${C.red}${err.message}${C.reset}`);
    return null;
  }
}

async function main() {
  console.log(`\n${C.cyan}${"═".repeat(60)}${C.reset}`);
  console.log(`${C.bold}  Beneat Risk MCP — E2E Integration Test${C.reset}`);
  console.log(`${C.cyan}${"═".repeat(60)}${C.reset}`);
  console.log(`${C.dim}  Wallet: ${WALLET}${C.reset}`);
  console.log(`${C.dim}  Server: ${SERVER_PATH}${C.reset}\n`);

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    env: {
      ...process.env,
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    },
  });

  const client = new Client({ name: "beneat-e2e", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`${C.green}  Connected — ${tools.length} tools available${C.reset}`);

  const toolsWithOutputSchema = tools.filter(t => t.outputSchema);
  console.log(`${C.dim}  Tools with outputSchema: ${toolsWithOutputSchema.length}/${tools.length}${C.reset}`);

  let hasResources = false;
  let hasPrompts = false;
  try {
    const { resources } = await client.listResources();
    const { resourceTemplates } = await client.listResourceTemplates();
    hasResources = (resources?.length ?? 0) + (resourceTemplates?.length ?? 0) > 0;
    console.log(`${C.dim}  Resources: ${resources?.length ?? 0} static, ${resourceTemplates?.length ?? 0} templates${C.reset}`);
  } catch { /* resources not supported by this client */ }
  try {
    const { prompts } = await client.listPrompts();
    hasPrompts = (prompts?.length ?? 0) > 0;
    console.log(`${C.dim}  Prompts: ${prompts?.length ?? 0}${C.reset}`);
  } catch { /* prompts not supported by this client */ }
  console.log();

  // ═══════════════════════════════════════════════
  // Phase 1: Discovery (no prior state)
  // ═══════════════════════════════════════════════
  console.log(`${C.bold}  Phase 1: Discovery${C.reset}`);

  await runTest(
    client,
    "1. get_status — vault-optional activity summary",
    "beneat_get_status",
    { wallet_address: WALLET },
    (r) => {
      assert("has_vault" in r, "missing has_vault");
      assert("wallet" in r, "missing wallet");
      assert("can_trade" in r, "missing can_trade");
      if (!r.has_vault) {
        assert(r.mode === "advisory", "no-vault mode should be advisory");
        assert(r.recent_activity !== undefined, "missing recent_activity for vault-less wallet");
        assert("trades_7d" in r.recent_activity, "missing trades_7d");
        assert("protocols_used" in r.recent_activity, "missing protocols_used");
      }
    }
  );

  await runTest(
    client,
    "2. verify_agent — trust score from history",
    "beneat_verify_agent",
    { wallet_address: WALLET },
    (r) => {
      assert(typeof r.trust_score === "number", "trust_score should be number");
      assert(typeof r.risk_grade === "string", "risk_grade should be string");
      assert(Array.isArray(r.factors), "factors should be array");
      assert("trades_analyzed" in r, "missing trades_analyzed");
      assert(r.trust_score >= 0 && r.trust_score <= 100, "trust_score out of range");
    }
  );

  await runTest(
    client,
    "3. get_leaderboard — ranked agents",
    "beneat_get_leaderboard",
    {},
    (r) => {
      assert(Array.isArray(r.entries), "entries should be array");
      assert(typeof r.total === "number", "total should be number");
    }
  );

  // ═══════════════════════════════════════════════
  // Phase 2: Analysis (read-only)
  // ═══════════════════════════════════════════════
  console.log(`\n${C.bold}  Phase 2: Analysis${C.reset}`);

  await runTest(
    client,
    "4. get_analytics — behavioral metrics + directives",
    "beneat_get_analytics",
    { wallet_address: WALLET },
    (r) => {
      assert("analytics" in r, "missing analytics");
      assert("directives" in r, "missing directives");
      assert(typeof r.analytics.total_trades === "number", "missing total_trades");
      assert(typeof r.analytics.hallucination_rate === "number", "missing hallucination_rate");
      assert(typeof r.analytics.signal_accuracy === "number", "missing signal_accuracy");
      assert("tilt" in r.analytics, "missing tilt");
      assert("trend" in r.analytics, "missing trend");
      assert(Array.isArray(r.directives), "directives should be array");
      assert(Array.isArray(r.protocols_detected), "protocols_detected should be array");
    }
  );

  await runTest(
    client,
    "5. get_playbook — identity, markets, sizing, rules",
    "beneat_get_playbook",
    { wallet_address: WALLET },
    (r) => {
      assert("playbook" in r, "missing playbook");
      assert(typeof r.playbook.identity === "string", "missing identity");
      assert(Array.isArray(r.playbook.primary_markets), "missing primary_markets");
      assert(Array.isArray(r.playbook.restricted_markets), "missing restricted_markets");
      assert("position_sizing" in r.playbook, "missing position_sizing");
      assert("behavioral_rules" in r.playbook, "missing behavioral_rules");
      assert("regime" in r.playbook, "missing regime");
      assert(typeof r.playbook.expectancy_sol === "number", "missing expectancy_sol");
    }
  );

  await runTest(
    client,
    "6. health_check — Drift positions + session health",
    "beneat_health_check",
    { wallet_address: WALLET },
    (r) => {
      assert("wallet" in r, "missing wallet");
      assert("has_vault" in r, "missing has_vault");
    }
  );

  // ═══════════════════════════════════════════════
  // Phase 3: Calibration (generates unsigned TXs)
  // ═══════════════════════════════════════════════
  console.log(`\n${C.bold}  Phase 3: Calibration${C.reset}`);

  await runTest(
    client,
    "7. calibrate — risk params + unsigned TXs",
    "beneat_calibrate",
    {
      wallet_address: WALLET,
      deposit_amount: 1,
      strategy_type: "day_trading",
      risk_tolerance: "medium",
    },
    (r) => {
      assert("calibration" in r, "missing calibration");
      assert("parameters" in r, "missing parameters");
      assert(Array.isArray(r.unsigned_transactions), "missing unsigned_transactions");
      assert(r.unsigned_transactions.length > 0, "should have at least 1 unsigned tx");
      assert(typeof r.calibration.tier === "number", "missing tier");
      assert(typeof r.parameters.daily_loss_limit_sol === "number", "missing daily_loss_limit_sol");
      assert(typeof r.parameters.max_trades_per_day === "number", "missing max_trades_per_day");
      for (const tx of r.unsigned_transactions) {
        assert(typeof tx.transaction === "string", "tx should have base64 transaction");
        assert(typeof tx.blockhash === "string", "tx should have blockhash");
        assert(typeof tx.description === "string", "tx should have description");
      }
    }
  );

  await runTest(
    client,
    "8. recalibrate — re-run with defaults",
    "beneat_recalibrate",
    { wallet_address: WALLET },
    (r) => {
      assert("calibration" in r, "missing calibration");
      assert("parameters" in r, "missing parameters");
      assert(Array.isArray(r.unsigned_transactions), "missing unsigned_transactions");
    }
  );

  // ═══════════════════════════════════════════════
  // Phase 4: Trading session (in-memory)
  // ═══════════════════════════════════════════════
  console.log(`\n${C.bold}  Phase 4: Trading Session${C.reset}`);

  await runTest(
    client,
    "9. get_session_strategy — session mode + limits",
    "beneat_get_session_strategy",
    { wallet_address: WALLET },
    (r) => {
      assert("strategy" in r, "missing strategy");
      assert(["aggressive", "normal", "conservative_recovery"].includes(r.strategy.mode), "invalid mode");
      assert(typeof r.strategy.max_trades === "number", "missing max_trades");
      assert(typeof r.strategy.max_exposure_sol === "number", "missing max_exposure_sol");
      assert(Array.isArray(r.strategy.focus_markets), "missing focus_markets");
      assert(typeof r.strategy.position_size_sol === "number", "missing position_size_sol");
      assert(Array.isArray(r.strategy.stop_trading_conditions), "missing stop_trading_conditions");
    }
  );

  await runTest(
    client,
    "10. check_trade — pre-flight + coaching",
    "beneat_check_trade",
    {
      wallet_address: WALLET,
      market: "SOL-PERP",
      size: 0.1,
      direction: "long",
      include_coaching: true,
    },
    (r) => {
      assert("can_trade" in r, "missing can_trade");
      assert("mode" in r || "approved" in r, "missing mode or approved");
    }
  );

  await runTest(
    client,
    "11. record_trade — winning trade (+0.05 SOL)",
    "beneat_record_trade",
    { wallet_address: WALLET, pnl: 0.05, market: "SOL-PERP" },
    (r) => {
      assert("session_summary" in r, "missing session_summary");
      assert(typeof r.session_summary.daily_pnl_sol === "number", "missing daily_pnl_sol");
      assert(r.session_summary.trade_count >= 1, "trade_count should be >= 1");
    }
  );

  await runTest(
    client,
    "12. record_trade — losing trade with confidence (-0.02 SOL, conf=0.8)",
    "beneat_record_trade",
    { wallet_address: WALLET, pnl: -0.02, market: "SOL-PERP", confidence: 0.8 },
    (r) => {
      assert("session_summary" in r, "missing session_summary");
      assert(r.session_summary.trade_count >= 2, "trade_count should be >= 2");
    }
  );

  await runTest(
    client,
    "13. check_trade — coaching context changes after losses",
    "beneat_check_trade",
    { wallet_address: WALLET, market: "SOL-PERP", size: 0.05, include_coaching: true },
    (r) => {
      assert("can_trade" in r, "missing can_trade");
    }
  );

  await runTest(
    client,
    "14. record_trade — accumulate losses (-0.03 SOL)",
    "beneat_record_trade",
    { wallet_address: WALLET, pnl: -0.03, market: "SOL-PERP" },
    (r) => {
      assert("session_summary" in r, "missing session_summary");
      assert(r.session_summary.trade_count >= 3, "trade_count should be >= 3");
    }
  );

  // ═══════════════════════════════════════════════
  // Phase 5: Advanced tools
  // ═══════════════════════════════════════════════
  console.log(`\n${C.bold}  Phase 5: Advanced${C.reset}`);

  await runTest(
    client,
    "15. calibrate_confidence — confidence calibration",
    "beneat_calibrate_confidence",
    { wallet_address: WALLET, confidence: 0.7 },
    (r) => {
      assert("calibration" in r, "missing calibration");
      assert(typeof r.calibration.input_confidence === "number", "missing input_confidence");
      assert(typeof r.calibration.calibrated_confidence === "number", "missing calibrated_confidence");
      assert(typeof r.calibration.position_size_recommendation_sol === "number", "missing position_size_recommendation_sol");
      assert(typeof r.calibration.insight === "string", "missing insight");
      assert(Array.isArray(r.calibration.calibration_curve), "missing calibration_curve");
    }
  );

  await runTest(
    client,
    "16. get_analytics — updated with session data",
    "beneat_get_analytics",
    { wallet_address: WALLET },
    (r) => {
      assert("analytics" in r, "missing analytics");
      assert(Array.isArray(r.directives), "missing directives");
    }
  );

  await runTest(
    client,
    "17. register_agent — register on leaderboard",
    "beneat_register_agent",
    { wallet: WALLET, name: "E2E Test Agent" },
    (r) => {
      assert("wallet" in r, "missing wallet");
      assert("name" in r, "missing name");
      assert("status" in r, "missing status");
    },
    { allowError: true }
  );

  await runTest(
    client,
    "18. cancel_swap — diagnostic",
    "beneat_cancel_swap",
    { wallet_address: WALLET },
    (r) => {
      assert("swap_in_progress" in r, "missing swap_in_progress");
      assert("message" in r, "missing message");
    }
  );

  await runTest(
    client,
    "19. set_policy — policy status check",
    "beneat_set_policy",
    { wallet_address: WALLET, action: "status" },
    (r) => {
      assert("success" in r, "missing success field");
      if (!r.success) {
        assert("error" in r || "setup_instructions" in r, "failed policy should explain why");
      }
    },
    { allowError: true }
  );

  await runTest(
    client,
    "20. get_profile — on-chain profile",
    "beneat_get_profile",
    { wallet_address: WALLET },
    (r) => {
      assert("wallet" in r, "missing wallet");
    }
  );

  // ═══════════════════════════════════════════════
  // Phase 6: SDK compliance checks
  // ═══════════════════════════════════════════════
  console.log(`\n${C.bold}  Phase 6: SDK Compliance${C.reset}`);

  await runTest(
    client,
    "21. structuredContent — status returns structured data",
    "beneat_get_status",
    { wallet_address: WALLET },
    (r, meta) => {
      assert(meta.structuredContent !== null, "structuredContent should be present");
      assert(typeof meta.structuredContent === "object", "structuredContent should be object");
      assert("can_trade" in meta.structuredContent, "structuredContent missing can_trade");
      assert("wallet" in meta.structuredContent, "structuredContent missing wallet");
    }
  );

  await runTest(
    client,
    "22. structuredContent — verify_agent returns structured data",
    "beneat_verify_agent",
    { wallet_address: WALLET },
    (r, meta) => {
      assert(meta.structuredContent !== null, "structuredContent should be present");
      assert("trust_score" in meta.structuredContent, "structuredContent missing trust_score");
      assert("risk_grade" in meta.structuredContent, "structuredContent missing risk_grade");
    }
  );

  await runTest(
    client,
    "23. outputSchema — tools have output schemas",
    "beneat_get_status",
    { wallet_address: WALLET },
    () => {
      assert(toolsWithOutputSchema.length >= 19, `expected >= 19 tools with outputSchema, got ${toolsWithOutputSchema.length}`);
    }
  );

  // ═══════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════
  console.log(`\n${C.cyan}${"═".repeat(60)}${C.reset}`);
  console.log(`${C.bold}  Results: ${C.green}${passed} passed${C.reset}, ${failed > 0 ? `${C.red}${failed} failed` : `${C.dim}0 failed`}${C.reset} ${C.dim}(${results.reduce((s, r) => s + r.elapsed, 0)}ms total)${C.reset}`);
  console.log(`${C.cyan}${"═".repeat(60)}${C.reset}`);

  if (failed > 0) {
    console.log(`\n${C.red}  Failed tests:${C.reset}`);
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`    ${C.red}${r.name}: ${r.error}${C.reset}`);
    }
  }

  console.log();
  await client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}E2E test crashed: ${err.message}${C.reset}`);
  console.error(err.stack);
  process.exit(1);
});

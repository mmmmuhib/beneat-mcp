import { z } from "zod";

import { statusSchema, getStatus } from "./tools/status.js";
import { profileSchema, getProfile } from "./tools/profile.js";
import { verifySchema, verifyAgent } from "./tools/verify.js";
import { checkTradeSchema, checkTrade } from "./tools/check-trade.js";
import { recordTradeSchema, recordTrade } from "./tools/record-trade.js";
import {
  calibrateSchema,
  recalibrateSchema,
  calibrate,
  recalibrate,
} from "./tools/calibrate.js";
import { healthCheckSchema, healthCheck } from "./tools/health-check.js";
import { cancelSwapSchema, cancelSwap } from "./tools/cancel-swap.js";
import { setPolicySchema, setPolicy } from "./tools/set-policy.js";
import { analyticsSchema, getAnalytics } from "./tools/analytics.js";
import { leaderboardSchema, getLeaderboard } from "./tools/leaderboard.js";
import { registerAgentSchema, registerAgent } from "./tools/register-agent.js";
import { playbookSchema, getPlaybook } from "./tools/playbook.js";
import {
  calibrateConfidenceSchema,
  getCalibrateConfidence,
} from "./tools/calibrate-confidence.js";
import {
  sessionStrategySchema,
  getSessionStrategy,
} from "./tools/session-strategy.js";
import { resetSessionSchema, resetSession } from "./tools/reset-session.js";
import {
  setAdvisoryLimitsSchema,
  setAdvisoryLimitsHandler,
} from "./tools/set-advisory-limits.js";
import {
  smartRouteSchema,
  createSmartRouteHandler,
} from "./tools/smart-route.js";
import type { ToolDocument } from "./lib/reranker.js";
import type { SessionState } from "./lib/types.js";

export type ToolCategory =
  | "observation"
  | "enforcement"
  | "calibration"
  | "coaching"
  | "admin"
  | "routing";

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  category: ToolCategory;
  annotations: ToolAnnotations;
  schema: z.ZodObject<any>;
  outputSchema?: z.ZodObject<any>;
  handler: (input: any) => Promise<any>;
  /** Per-session-state relevance weights (0-1). */
  sessionRelevance?: Partial<Record<SessionState, number>>;
}

const unsignedTxSchema = z.object({
  transaction: z.string(),
  blockhash: z.string(),
  last_valid_block_height: z.number(),
  description: z.string(),
}).passthrough();

function out(shape: Record<string, z.ZodTypeAny>) {
  return z.object(shape).passthrough();
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: "beneat_get_status",
    title: "Vault Status",
    description:
      "Get the current vault status for a wallet — lockout state, cooldown, trade budget, and whether the agent can trade right now.",
    category: "observation",
    annotations: { readOnlyHint: true, openWorldHint: true },
    sessionRelevance: { normal: 0.7, post_loss: 0.8, tilt: 0.9, hot_streak: 0.5, post_lockout_recovery: 1.0 },
    schema: statusSchema,
    outputSchema: out({
      has_vault: z.boolean(),
      wallet: z.string(),
      can_trade: z.boolean(),
      mode: z.string().optional(),
      is_locked: z.boolean().optional(),
      lockout_remaining_seconds: z.number().optional(),
      trades_remaining: z.number().optional(),
      max_trades_per_day: z.number().optional(),
      daily_loss_limit_sol: z.number().optional(),
    }),
    handler: getStatus,
  },
  {
    name: "beneat_get_profile",
    title: "Trader Profile",
    description:
      "Get the on-chain trader profile (reputation scores, win rate, trading history) for a wallet.",
    category: "observation",
    annotations: { readOnlyHint: true, openWorldHint: true },
    sessionRelevance: { normal: 0.6, post_loss: 0.5, tilt: 0.4, hot_streak: 0.6, post_lockout_recovery: 0.5 },
    schema: profileSchema,
    outputSchema: out({
      has_profile: z.boolean(),
      wallet: z.string(),
      ratings: out({
        overall: z.number(),
        discipline: z.number(),
        patience: z.number(),
        consistency: z.number(),
        timing: z.number(),
        risk_control: z.number(),
        endurance: z.number(),
      }).optional(),
      stats: out({
        total_trades: z.number(),
        total_wins: z.number(),
        win_rate_pct: z.number(),
        total_pnl_lamports: z.string(),
        avg_trade_size_lamports: z.string(),
        trading_days: z.number(),
      }).optional(),
    }),
    handler: getProfile,
  },
  {
    name: "beneat_verify_agent",
    title: "Verify Agent",
    description:
      "Verify an agent's on-chain risk reputation. Returns a trust score (0-100) and risk grade (A-F) based on vault config and trading profile.",
    category: "observation",
    annotations: { readOnlyHint: true, openWorldHint: true },
    sessionRelevance: { normal: 0.5, post_loss: 0.3, tilt: 0.2, hot_streak: 0.4, post_lockout_recovery: 0.6 },
    schema: verifySchema,
    outputSchema: out({
      wallet: z.string(),
      trust_score: z.number(),
      risk_grade: z.string(),
      factors: z.array(z.string()),
      has_vault: z.boolean(),
      has_profile: z.boolean(),
      trades_analyzed: z.number(),
      summary: z.string(),
    }),
    handler: verifyAgent,
  },
  {
    name: "beneat_check_trade",
    title: "Pre-flight Trade Check",
    description:
      "Pre-flight check: can this agent execute a trade right now? Checks lockout, cooldown, trade count limits, daily loss budget, and risk:reward ratio. Returns approved/denied with reasons.",
    category: "enforcement",
    annotations: { readOnlyHint: true },
    sessionRelevance: { normal: 0.9, post_loss: 0.9, tilt: 0.7, hot_streak: 0.8, post_lockout_recovery: 0.3 },
    schema: checkTradeSchema,
    outputSchema: out({
      approved: z.boolean(),
      can_trade: z.boolean(),
      mode: z.enum(["on-chain", "advisory"]),
      reasons: z.array(z.string()).optional(),
      trades_remaining: z.number().optional(),
      daily_budget_remaining_sol: z.string().optional(),
      risk_reward_ratio: z.number().optional(),
      min_risk_reward_ratio: z.number().optional(),
    }),
    handler: checkTrade,
  },
  {
    name: "beneat_record_trade",
    title: "Record Trade",
    description:
      "Record a completed trade's P&L in the session tracker. Checks if daily loss limit is breached and returns warnings. Use after every trade execution.",
    category: "enforcement",
    annotations: { readOnlyHint: false, idempotentHint: false },
    sessionRelevance: { normal: 0.8, post_loss: 0.8, tilt: 0.6, hot_streak: 0.9, post_lockout_recovery: 0.2 },
    schema: recordTradeSchema,
    outputSchema: out({
      recorded: z.boolean(),
      session_summary: out({
        trade_count: z.number(),
        daily_pnl_sol: z.number(),
        last_trade_pnl_sol: z.number(),
        session_start: z.number(),
      }),
      lockout_triggered: z.boolean(),
      has_vault: z.boolean(),
      warnings: z.array(z.string()).optional(),
    }),
    handler: recordTrade,
  },
  {
    name: "beneat_reset_session",
    title: "Reset Session",
    description:
      "Reset the in-memory trading session for a wallet. Clears trade count, daily P&L, lockout state, and advisory limits. Used by benchmarks to simulate day boundaries.",
    category: "admin",
    annotations: { readOnlyHint: false, idempotentHint: true },
    sessionRelevance: { normal: 0.2, post_loss: 0.3, tilt: 0.4, hot_streak: 0.1, post_lockout_recovery: 0.6 },
    schema: resetSessionSchema,
    outputSchema: out({
      reset: z.boolean(),
      wallet: z.string(),
    }),
    handler: resetSession,
  },
  {
    name: "beneat_set_advisory_limits",
    title: "Set Advisory Limits",
    description:
      "Configure advisory risk limits for a wallet session. Sets daily loss limit, max trades, and cooldown. Used by benchmarks to apply relaxed limits that account for simulated-time vs wall-clock differences.",
    category: "admin",
    annotations: { readOnlyHint: false, idempotentHint: true },
    sessionRelevance: { normal: 0.3, post_loss: 0.2, tilt: 0.2, hot_streak: 0.2, post_lockout_recovery: 0.4 },
    schema: setAdvisoryLimitsSchema,
    outputSchema: out({
      success: z.boolean(),
      wallet: z.string(),
      limits: out({
        daily_loss_limit: z.number(),
        max_trades: z.number(),
        cooldown_ms: z.number(),
        min_risk_reward_ratio: z.number().optional(),
      }),
    }),
    handler: setAdvisoryLimitsHandler,
  },
  {
    name: "beneat_calibrate",
    title: "Calibrate Risk Parameters",
    description:
      "Auto-calibrate risk parameters from on-chain trading history. Returns unsigned transactions to initialize vault, set rules, and create trader profile. Tier 1 = capital-based, Tier 2 = behavioral, Tier 3 = quantitative (VaR, Sharpe, Kelly).",
    category: "calibration",
    annotations: { readOnlyHint: false, openWorldHint: true },
    sessionRelevance: { normal: 0.5, post_loss: 0.4, tilt: 0.3, hot_streak: 0.3, post_lockout_recovery: 0.8 },
    schema: calibrateSchema,
    outputSchema: out({
      calibration: out({
        tier: z.number(),
        strategy_type: z.string(),
        risk_tolerance: z.string(),
        trades_analyzed: z.number(),
        lookback_days: z.number(),
      }),
      parameters: out({
        daily_loss_limit_sol: z.number(),
        max_trades_per_day: z.number(),
        lockout_duration_seconds: z.number(),
        cooldown_seconds: z.number(),
      }),
      unsigned_transactions: z.array(unsignedTxSchema),
      vault_existed: z.boolean(),
      profile_existed: z.boolean(),
      instructions: z.string(),
    }),
    handler: calibrate,
  },
  {
    name: "beneat_recalibrate",
    title: "Recalibrate",
    description:
      "Re-run calibration using latest on-chain history. Shorthand for beneat_calibrate with default parameters.",
    category: "calibration",
    annotations: { readOnlyHint: false, openWorldHint: true },
    sessionRelevance: { normal: 0.3, post_loss: 0.4, tilt: 0.3, hot_streak: 0.2, post_lockout_recovery: 0.7 },
    schema: recalibrateSchema,
    outputSchema: out({
      calibration: out({
        tier: z.number(),
        strategy_type: z.string(),
        risk_tolerance: z.string(),
        trades_analyzed: z.number(),
        lookback_days: z.number(),
      }),
      parameters: out({
        daily_loss_limit_sol: z.number(),
        max_trades_per_day: z.number(),
        lockout_duration_seconds: z.number(),
        cooldown_seconds: z.number(),
      }),
      unsigned_transactions: z.array(unsignedTxSchema),
    }),
    handler: recalibrate,
  },
  {
    name: "beneat_health_check",
    title: "Portfolio Health Check",
    description:
      "Check portfolio health: read Drift perpetual positions, compute unrealized P&L, and warn if losses approach the daily limit.",
    category: "observation",
    annotations: { readOnlyHint: true, openWorldHint: true },
    sessionRelevance: { normal: 0.6, post_loss: 0.9, tilt: 0.8, hot_streak: 0.5, post_lockout_recovery: 0.7 },
    schema: healthCheckSchema,
    outputSchema: out({
      wallet: z.string(),
      has_vault: z.boolean(),
      health: z.enum(["healthy", "attention_needed"]),
      session: out({
        trade_count: z.number(),
        daily_pnl_sol: z.number(),
        session_start: z.number(),
        last_activity: z.number(),
      }),
      warnings: z.array(z.string()).optional(),
    }),
    handler: healthCheck,
  },
  {
    name: "beneat_cancel_swap",
    title: "Cancel Stuck Swap",
    description:
      "Diagnose and help resolve a stuck swap_in_progress state on the vault. Returns pending swap details and resolution steps.",
    category: "observation",
    annotations: { readOnlyHint: true },
    sessionRelevance: { normal: 0.1, post_loss: 0.2, tilt: 0.1, hot_streak: 0.1, post_lockout_recovery: 0.6 },
    schema: cancelSwapSchema,
    outputSchema: out({
      swap_in_progress: z.boolean(),
      message: z.string(),
      resolution_steps: z.array(z.string()).optional(),
    }),
    handler: cancelSwap,
  },
  {
    name: "beneat_set_policy",
    title: "Manage Wallet Policy",
    description:
      'Manage AgentWallet spending policy. Actions: freeze (block all transactions), restore (unfreeze after lockout), sync (derive policy from vault risk rules), status (view current policy). Requires ~/.agentwallet/config.json.',
    category: "enforcement",
    annotations: { readOnlyHint: false, destructiveHint: true },
    sessionRelevance: { normal: 0.3, post_loss: 0.5, tilt: 0.7, hot_streak: 0.2, post_lockout_recovery: 0.9 },
    schema: setPolicySchema,
    outputSchema: out({
      success: z.boolean(),
      action: z.string().optional(),
      detail: z.string().optional(),
      error: z.string().optional(),
    }),
    handler: setPolicy,
  },
  {
    name: "beneat_get_analytics",
    title: "Behavioral Analytics",
    description:
      "Agent performance analytics: hallucination rate, signal accuracy by market/protocol, overconfidence index, tilt detection, revenge hallucination rate, trend analysis, and actionable recommendations to improve the agent. Works with any trading protocol on Solana.",
    category: "coaching",
    annotations: { readOnlyHint: true, openWorldHint: true },
    sessionRelevance: { normal: 0.5, post_loss: 0.7, tilt: 0.8, hot_streak: 0.4, post_lockout_recovery: 0.6 },
    schema: analyticsSchema,
    outputSchema: out({
      wallet: z.string(),
      lookback_days: z.number(),
      has_vault: z.boolean(),
      protocols_detected: z.array(z.string()),
      analytics: out({
        total_trades: z.number(),
        hallucination_rate: z.number(),
        signal_accuracy: z.number(),
        overconfidence_index: z.number(),
        recommendations: z.array(z.string()),
      }),
      directives: z.array(out({
        type: z.string(),
        severity: z.enum(["info", "warning", "critical"]),
        reason: z.string(),
      })),
    }),
    handler: getAnalytics,
  },
  {
    name: "beneat_get_leaderboard",
    title: "Agent Leaderboard",
    description:
      "Get ranked leaderboard of all Beneat-verified agents. Returns trust grades, ratings, win rates, P&L, discipline scores, and lockout history. Sortable by rating, win_rate, trades, or discipline.",
    category: "observation",
    annotations: { readOnlyHint: true },
    sessionRelevance: { normal: 0.4, post_loss: 0.2, tilt: 0.1, hot_streak: 0.3, post_lockout_recovery: 0.3 },
    schema: leaderboardSchema,
    outputSchema: out({
      entries: z.array(out({
        wallet: z.string(),
        trust_grade: z.string(),
        trust_score: z.number(),
        overall_rating: z.number(),
        win_rate: z.number(),
        total_trades: z.number(),
        status: z.enum(["verified", "tracked"]),
      })),
      total: z.number(),
    }),
    handler: getLeaderboard,
  },
  {
    name: "beneat_register_agent",
    title: "Register Agent",
    description:
      "Register an AI trading agent on the Beneat leaderboard. Any Solana trading agent can self-signup to be tracked. Returns success status. Agents start as 'tracked' and upgrade to 'verified' when they create a Beneat vault.",
    category: "observation",
    annotations: { readOnlyHint: false, idempotentHint: true },
    sessionRelevance: { normal: 0.3, post_loss: 0.1, tilt: 0.1, hot_streak: 0.2, post_lockout_recovery: 0.2 },
    schema: registerAgentSchema,
    outputSchema: out({
      success: z.boolean(),
      wallet: z.string(),
      name: z.string(),
      status: z.string(),
    }),
    handler: registerAgent,
  },
  {
    name: "beneat_get_playbook",
    title: "Trading Playbook",
    description:
      "Generate a personalized, evolving trading playbook based on on-chain history. Identifies agent identity, primary/restricted markets, Kelly-based position sizing, behavioral rules, regime detection, and profit factor. Use enforce=true to write playbook rules on-chain.",
    category: "coaching",
    annotations: { readOnlyHint: false, openWorldHint: true },
    sessionRelevance: { normal: 0.6, post_loss: 0.5, tilt: 0.4, hot_streak: 0.5, post_lockout_recovery: 0.7 },
    schema: playbookSchema,
    outputSchema: out({
      wallet: z.string(),
      trades_analyzed: z.number(),
      has_vault: z.boolean(),
      playbook: out({
        identity: z.string(),
        primary_markets: z.array(out({
          market: z.string(),
          win_rate: z.number(),
          edge_rating: z.enum(["strong", "moderate", "weak"]),
        })),
        restricted_markets: z.array(z.string()),
        position_sizing: out({
          kelly_fraction: z.number(),
          half_kelly_sol: z.number(),
          max_position_pct: z.number(),
        }),
        expectancy_sol: z.number(),
        profit_factor: z.number(),
      }),
      unsigned_transactions: z.array(unsignedTxSchema).optional(),
    }),
    handler: getPlaybook,
  },
  {
    name: "beneat_calibrate_confidence",
    title: "Calibrate Confidence",
    description:
      "Calibrate agent confidence against historical accuracy. Maps reported confidence to actual win rate by bin, returns calibrated confidence and position size recommendation. Requires trades recorded with confidence via beneat_record_trade.",
    category: "calibration",
    annotations: { readOnlyHint: true },
    sessionRelevance: { normal: 0.5, post_loss: 0.6, tilt: 0.7, hot_streak: 0.6, post_lockout_recovery: 0.4 },
    schema: calibrateConfidenceSchema,
    outputSchema: out({
      wallet: z.string(),
      session_trades_with_confidence: z.number(),
      calibration: out({
        input_confidence: z.number(),
        calibrated_confidence: z.number(),
        historical_accuracy: z.number(),
        position_size_recommendation_sol: z.number(),
        insight: z.string(),
        calibration_curve: z.array(out({
          range: z.string(),
          actual_accuracy: z.number(),
          trade_count: z.number(),
        })),
      }),
    }),
    handler: getCalibrateConfidence,
  },
  {
    name: "beneat_get_session_strategy",
    title: "Session Strategy",
    description:
      "Generate a complete strategy for the current trading session. Determines mode (aggressive/normal/conservative_recovery), max trades, exposure limits, focus markets, position sizing, and stop conditions. Use enforce=true to write strategy on-chain.",
    category: "coaching",
    annotations: { readOnlyHint: false, openWorldHint: true },
    sessionRelevance: { normal: 0.8, post_loss: 0.7, tilt: 0.6, hot_streak: 0.7, post_lockout_recovery: 0.9 },
    schema: sessionStrategySchema,
    outputSchema: out({
      wallet: z.string(),
      trades_analyzed: z.number(),
      has_vault: z.boolean(),
      strategy: out({
        mode: z.enum(["aggressive", "normal", "conservative_recovery"]),
        reason: z.string(),
        max_trades: z.number(),
        max_exposure_sol: z.number(),
        focus_markets: z.array(z.string()),
        position_size_sol: z.number(),
        position_size_pct: z.number(),
        stop_trading_conditions: z.array(z.string()),
      }),
      unsigned_transactions: z.array(unsignedTxSchema).optional(),
    }),
    handler: getSessionStrategy,
  },
];

/* ── Build reranking documents from the core tools ─────── */

function buildToolDocuments(): ToolDocument[] {
  // Only include the 16 core tools, not smart_route itself
  return TOOL_REGISTRY.filter((t) => t.name !== "beneat_smart_route").map(
    (tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      category: tool.category,
      readOnly: tool.annotations.readOnlyHint ?? false,
      destructive: tool.annotations.destructiveHint ?? false,
      sessionRelevance: tool.sessionRelevance,
    })
  );
}

/* ── Register smart-route as 17th tool ────────────────── */

const toolDocuments = buildToolDocuments();

TOOL_REGISTRY.push({
  name: "beneat_smart_route",
  title: "Smart Tool Router",
  description:
    "Route a natural-language intent to the most relevant Beneat tools using semantic reranking. Optionally incorporates the agent's current session state (tilt, post_lockout, hot_streak) for context-aware routing. Use this when unsure which tool to call.",
  category: "routing",
  annotations: { readOnlyHint: true, openWorldHint: true },
  schema: smartRouteSchema,
  outputSchema: out({
    intent: z.string(),
    session_state: z.string(),
    reranked: z.boolean(),
    model: z.string(),
    tools: z.array(
      out({
        name: z.string(),
        title: z.string(),
        description: z.string(),
        category: z.string(),
        relevance_score: z.number(),
      })
    ),
    tip: z.string(),
  }),
  handler: createSmartRouteHandler(toolDocuments),
});

export { toolDocuments };

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const zodVal = value as z.ZodTypeAny;
      properties[key] = zodToJsonSchema(zodVal);
      if (!(zodVal instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    const result: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) result.required = required;
    return result;
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(schema.element) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: "number" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodBoolean) {
    const out: Record<string, unknown> = { type: "boolean" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodEnum) {
    const out: Record<string, unknown> = {
      type: "string",
      enum: schema.options,
    };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault());
  }
  return { type: "string" };
}

export function getToolManifest(): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return TOOL_REGISTRY.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  }));
}

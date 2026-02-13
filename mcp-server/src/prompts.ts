import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "analyze-agent",
    {
      title: "Analyze Agent",
      description:
        "Full behavioral analysis of an AI trading agent. Runs analytics, playbook generation, and trust verification in sequence.",
      argsSchema: {
        wallet_address: z.string().describe("Solana wallet address (base58)"),
        lookback_days: z
          .string()
          .optional()
          .describe("Number of days to analyze (default 30)"),
      },
    },
    async ({ wallet_address, lookback_days }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform a complete analysis of trading agent ${wallet_address}.`,
              "",
              "Steps:",
              `1. Call beneat_get_analytics with wallet_address="${wallet_address}"${lookback_days ? ` and lookback_days=${lookback_days}` : ""}`,
              `2. Call beneat_get_playbook with wallet_address="${wallet_address}"`,
              `3. Call beneat_verify_agent with wallet_address="${wallet_address}"`,
              "",
              "Synthesize the results into a concise report covering:",
              "- Trust score and risk grade",
              "- Key behavioral issues (tilt, overconfidence, revenge trading)",
              "- Recommended markets and position sizing",
              "- Actionable improvements ranked by impact",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "plan-session",
    {
      title: "Plan Trading Session",
      description:
        "Generate a pre-session strategy with mode, limits, and focus markets.",
      argsSchema: {
        wallet_address: z.string().describe("Solana wallet address (base58)"),
      },
    },
    async ({ wallet_address }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Plan a trading session for agent ${wallet_address}.`,
              "",
              "Steps:",
              `1. Call beneat_get_session_strategy with wallet_address="${wallet_address}"`,
              `2. Call beneat_get_status with wallet_address="${wallet_address}"`,
              "",
              "Produce a concise session plan covering:",
              "- Session mode (aggressive/normal/conservative_recovery) and why",
              "- Max trades and exposure limits",
              "- Focus markets with reasoning",
              "- Stop conditions that should halt trading",
              "- Position sizing recommendation",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "investigate-lockout",
    {
      title: "Investigate Lockout",
      description:
        "Diagnose why a vault is locked out and recommend recovery steps.",
      argsSchema: {
        wallet_address: z.string().describe("Solana wallet address (base58)"),
      },
    },
    async ({ wallet_address }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Investigate the lockout state for agent ${wallet_address}.`,
              "",
              "Steps:",
              `1. Call beneat_get_status with wallet_address="${wallet_address}"`,
              `2. Call beneat_get_analytics with wallet_address="${wallet_address}"`,
              `3. Call beneat_health_check with wallet_address="${wallet_address}"`,
              "",
              "Analyze and report:",
              "- Is the vault currently locked? If so, time remaining",
              "- What caused the lockout (daily loss limit breach, manual lock, etc.)",
              "- Behavioral patterns leading to the lockout (tilt, revenge trading)",
              "- Recovery recommendations once lockout expires",
              "- Whether risk parameters should be recalibrated",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "calibrate-agent",
    {
      title: "Calibrate New Agent",
      description:
        "Setup a new trading agent with appropriate risk rules based on strategy and risk tolerance.",
      argsSchema: {
        wallet_address: z.string().describe("Solana wallet address (base58)"),
        strategy_type: z
          .string()
          .optional()
          .describe(
            "Trading strategy: scalping, day_trading, swing_trading, conservative"
          ),
      },
    },
    async ({ wallet_address, strategy_type }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Set up risk management for agent ${wallet_address}.`,
              "",
              "Steps:",
              `1. Call beneat_verify_agent with wallet_address="${wallet_address}" to check current state`,
              `2. Call beneat_calibrate with wallet_address="${wallet_address}"${strategy_type ? `, strategy_type="${strategy_type}"` : ""}, risk_tolerance="medium"`,
              "",
              "Present the results:",
              "- Calibration tier and why (Tier 1/2/3 based on trade history)",
              "- Recommended risk parameters (daily loss limit, max trades, cooldown, lockout)",
              "- List of unsigned transactions that need to be signed and submitted",
              "- Next steps for the agent to begin trading safely",
            ].join("\n"),
          },
        },
      ],
    })
  );
}

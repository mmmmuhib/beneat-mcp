import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readVault, readProfile } from "./lib/vault-reader.js";
import { getSession, getAllSessions } from "./lib/session-store.js";
import { bigintReplacer } from "./lib/utils.js";

export function registerResources(server: McpServer) {
  server.registerResource(
    "vault",
    new ResourceTemplate("beneat://vault/{wallet}", { list: undefined }),
    { description: "On-chain vault state for a wallet" },
    async (uri, variables) => {
      const wallet = variables.wallet as string;
      const vault = await readVault(wallet);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(vault, bigintReplacer, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "profile",
    new ResourceTemplate("beneat://profile/{wallet}", { list: undefined }),
    { description: "On-chain trader profile for a wallet" },
    async (uri, variables) => {
      const wallet = variables.wallet as string;
      const profile = await readProfile(wallet);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(profile, bigintReplacer, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "session",
    new ResourceTemplate("beneat://session/{wallet}", { list: undefined }),
    { description: "Current in-memory trading session for a wallet" },
    async (uri, variables) => {
      const wallet = variables.wallet as string;
      const session = getSession(wallet);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(session, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "leaderboard",
    "beneat://leaderboard",
    { description: "Active trading sessions summary" },
    async (uri) => {
      const sessions = getAllSessions();
      const entries = Array.from(sessions.entries()).map(([wallet, session]) => ({
        wallet,
        trade_count: session.tradeCount,
        daily_pnl_sol: session.dailyPnl,
        last_activity: session.lastActivity,
      }));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ entries, total: entries.length }, null, 2),
          },
        ],
      };
    }
  );
}

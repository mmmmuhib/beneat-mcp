#!/usr/bin/env node

/**
 * Beneat Risk MCP — MCP SDK client connecting via HTTP transport.
 *
 * Instead of spawning the server as a subprocess (stdio), this connects
 * over HTTP to a running server instance. Useful when the server runs
 * on a different machine, in a container, or is shared by multiple agents.
 *
 * Prerequisites:
 *   npm run start:http   (in the mcp-server directory)
 *   npm install @modelcontextprotocol/sdk
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVER_URL = "http://localhost:3001/mcp";
const WALLET = "YOUR_WALLET_ADDRESS";

const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
const client = new Client({ name: "test-http-client", version: "1.0.0" });

console.log(`Connecting to ${SERVER_URL}...`);
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Connected — ${tools.length} tools available:`);
for (const t of tools) {
  console.log(`  - ${t.name}`);
}

async function callTool(name, args) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.[0]?.text;
  return text ? JSON.parse(text) : response;
}

console.log("\n--- beneat_get_status ---");
const status = await callTool("beneat_get_status", {
  wallet_address: WALLET,
});
console.log(JSON.stringify(status, null, 2));

console.log("\n--- beneat_check_trade ---");
const check = await callTool("beneat_check_trade", {
  wallet_address: WALLET,
  market: "SOL-PERP",
  size: 0.1,
});
console.log(`Approved: ${check.approved}`);
console.log(`Trades remaining: ${check.trades_remaining}`);

await client.close();
console.log("\nDone.");

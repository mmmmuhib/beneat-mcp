#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOL_REGISTRY } from "./tool-registry.js";
import { jsonContent, safeCall } from "./lib/utils.js";
import { startHttpServer } from "./http-server.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const server = new McpServer({
  name: "beneat-risk",
  version: "0.1.0",
});

for (const tool of TOOL_REGISTRY) {
  const hasOutput = !!tool.outputSchema;
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.schema.shape,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      annotations: tool.annotations,
    },
    async (input: Record<string, unknown>) =>
      jsonContent(
        await safeCall(() => tool.handler(tool.schema.parse(input))),
        hasOutput
      )
  );
}

registerResources(server);
registerPrompts(server);

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--http")) {
    const portIdx = args.indexOf("--port");
    const port =
      portIdx !== -1
        ? parseInt(args[portIdx + 1], 10) || 3001
        : parseInt(process.env.PORT ?? "3001", 10);
    startHttpServer(port);
    console.error(
      `[beneat-risk] MCP server started — ${TOOL_REGISTRY.length} tools registered (HTTP mode)`
    );
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[beneat-risk] MCP server started — ${TOOL_REGISTRY.length} tools registered (incl. smart_route)`
  );
  console.error(
    `[beneat-risk] Reranker: ${process.env.COHERE_API_KEY ? "Cohere rerank-v4.0-fast" : "fallback (no COHERE_API_KEY)"}`
  );
}

main().catch((error) => {
  console.error("[beneat-risk] Fatal error:", error);
  process.exit(1);
});

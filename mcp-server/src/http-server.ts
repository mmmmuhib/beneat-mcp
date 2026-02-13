import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { TOOL_REGISTRY, getToolByName, getToolManifest, toolDocuments } from "./tool-registry.js";
import { safeCall, bigintReplacer, jsonContent } from "./lib/utils.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { rerankTools } from "./lib/reranker.js";
import { inferSessionState } from "./lib/session-store.js";
import { smartRouteSchema } from "./tools/smart-route.js";

const MAX_BODY = 1_048_576; // 1 MB
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle timeout
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastAccess: number;
}

const sessions = new Map<string, SessionEntry>();

interface OAuthClient {
  client_id: string;
  client_secret_hash: string;
  client_name?: string;
  scope: string;
  created_at: number;
}

interface OAuthAccessToken {
  token: string;
  client_id: string;
  scope: string;
  created_at: number;
  expires_at: number;
}

const oauthClients = new Map<string, OAuthClient>();
const oauthTokens = new Map<string, OAuthAccessToken>();

const TOKEN_TTL_MS = 60 * 60 * 1000;
const CLIENT_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_RATE_LIMIT = 10;
let registrationCount = 0;
let registrationWindowStart = Date.now();

function generateToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("hex")}`;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function readBodyRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function parseTokenBody(raw: string, contentType: string | undefined): Record<string, string> {
  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const result: Record<string, string> = {};
    for (const [key, value] of params) result[key] = value;
    return result;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {}
  return {};
}

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data, bigintReplacer));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "beneat-risk", version: "0.1.0" });
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
  return server;
}

function isInitializeRequest(body: unknown): boolean {
  if (typeof body === "object" && body !== null && "method" in body) {
    return (body as { method: string }).method === "initialize";
  }
  if (Array.isArray(body)) {
    return body.some((m) => typeof m === "object" && m !== null && m.method === "initialize");
  }
  return false;
}

function createSessionEntry(): SessionEntry {
  const server = createMcpServer();
  const entry: SessionEntry = { server, transport: null!, lastAccess: Date.now() };

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sessionId: string) => {
      sessions.set(sessionId, entry);
    },
    onsessionclosed: (sessionId: string) => {
      sessions.delete(sessionId);
    },
  });

  entry.transport = transport;
  server.connect(transport);
  return entry;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "POST";

  if (method === "GET" || method === "DELETE") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) {
      sendJson(res, 404, { jsonrpc: "2.0", error: { code: -32003, message: "Session not found" }, id: null });
      return;
    }
    entry.lastAccess = Date.now();
    await entry.transport.handleRequest(req, res);
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
    return;
  }

  if (isInitializeRequest(body)) {
    const entry = createSessionEntry();
    await entry.transport.handleRequest(req, res, body);
  } else {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) {
      sendJson(res, 404, { jsonrpc: "2.0", error: { code: -32003, message: "Session not found" }, id: null });
      return;
    }
    entry.lastAccess = Date.now();
    await entry.transport.handleRequest(req, res, body);
  }
}

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!AUTH_TOKEN) return true;

  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7);
    if (token === AUTH_TOKEN) return true;
    const oauthToken = oauthTokens.get(token);
    if (oauthToken && Date.now() < oauthToken.expires_at) return true;
    if (oauthToken) oauthTokens.delete(token);
  }

  const baseUrl = getBaseUrl(req);
  setCors(res);
  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": `Bearer realm="beneat-risk", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
  });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}

function getBaseUrl(req: IncomingMessage): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

async function handleToolCall(toolName: string, req: IncomingMessage, res: ServerResponse) {
  const tool = getToolByName(toolName);
  if (!tool) {
    sendJson(res, 404, { error: `Tool '${toolName}' not found` });
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bad request";
    sendJson(res, 400, { error: msg });
    return;
  }

  const parsed = tool.schema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 422, {
      error: "Validation failed",
      details: parsed.error.issues,
    });
    return;
  }

  const result = await safeCall(() => tool.handler(parsed.data));
  if (!result.ok) {
    sendJson(res, 500, { error: result.error });
    return;
  }
  sendJson(res, 200, result.data);
}

async function handleRoute(req: IncomingMessage, res: ServerResponse) {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bad request";
    sendJson(res, 400, { error: msg });
    return;
  }

  const parsed = smartRouteSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 422, {
      error: "Validation failed",
      details: parsed.error.issues,
    });
    return;
  }

  const { intent, wallet_address } = parsed.data;
  const topN = parsed.data.top_n ?? 5;

  const sessionState = wallet_address
    ? inferSessionState(wallet_address)
    : undefined;

  const result = await rerankTools(intent, toolDocuments, {
    topN: Math.min(topN, toolDocuments.length),
    sessionState,
  });

  sendJson(res, 200, {
    intent,
    session_state: sessionState ?? "unknown",
    reranked: result.reranked,
    model: result.model,
    tools: result.ranked_tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      category: t.category,
      relevance_score: t.relevance_score,
    })),
  });
}

const startTime = Date.now();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_TTL_MS) {
      entry.transport.close().catch(() => {});
      entry.server.close().catch(() => {});
      sessions.delete(id);
    }
  }
  for (const [token, data] of oauthTokens) {
    if (now > data.expires_at) oauthTokens.delete(token);
  }
  for (const [clientId, client] of oauthClients) {
    if (now - client.created_at > CLIENT_TTL_MS) {
      const hasActiveToken = [...oauthTokens.values()].some(
        (t) => t.client_id === clientId && now < t.expires_at
      );
      if (!hasActiveToken) oauthClients.delete(clientId);
    }
  }
}, 60_000);
cleanupInterval.unref();

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function validateHost(req: IncomingMessage, port: number): boolean {
  if (process.env.PUBLIC_URL) return true;

  const host = req.headers.host;
  if (!host) return false;

  const hostname = host.replace(/:\d+$/, "");
  return ALLOWED_HOSTS.has(hostname);
}

export function startHttpServer(port: number) {
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    setCors(res);

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!validateHost(req, port)) {
      sendJson(res, 403, { error: "Forbidden: invalid Host header" });
      return;
    }

    const skipAuth =
      path === "/health" ||
      path.startsWith("/.well-known/") ||
      path === "/register" ||
      path === "/oauth/token";
    if (!skipAuth && !checkAuth(req, res)) return;

    try {
      if (path === "/.well-known/oauth-protected-resource" && method === "GET") {
        const baseUrl = getBaseUrl(req);
        sendJson(res, 200, {
          resource: baseUrl,
          authorization_servers: [baseUrl],
          bearer_methods_supported: ["header"],
        });
        return;
      }

      if (path === "/.well-known/oauth-authorization-server" && method === "GET") {
        const baseUrl = getBaseUrl(req);
        sendJson(res, 200, {
          issuer: baseUrl,
          token_endpoint: `${baseUrl}/oauth/token`,
          registration_endpoint: `${baseUrl}/register`,
          token_endpoint_auth_methods_supported: ["client_secret_post"],
          grant_types_supported: ["client_credentials"],
          response_types_supported: [],
          scopes_supported: ["mcp:tools"],
        });
        return;
      }

      if (path === "/mcp" && (method === "POST" || method === "GET" || method === "DELETE")) {
        await handleMcp(req, res);
        return;
      }

      if (path === "/register" && method === "POST") {
        const now = Date.now();
        if (now - registrationWindowStart > 60_000) {
          registrationCount = 0;
          registrationWindowStart = now;
        }
        if (++registrationCount > REGISTRATION_RATE_LIMIT) {
          sendJson(res, 429, { error: "too_many_requests", error_description: "Registration rate limit exceeded. Try again in 1 minute." });
          return;
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await readBody(req)) as Record<string, unknown>;
        } catch {}

        const grantTypes = Array.isArray(body.grant_types) ? body.grant_types : ["client_credentials"];
        if (!grantTypes.includes("client_credentials")) {
          sendJson(res, 400, { error: "invalid_client_metadata", error_description: "Only client_credentials grant type is supported." });
          return;
        }

        const clientId = generateToken("bnrt_cid");
        const clientSecret = generateToken("bnrt_sec");

        oauthClients.set(clientId, {
          client_id: clientId,
          client_secret_hash: hashSecret(clientSecret),
          client_name: typeof body.client_name === "string" ? body.client_name : undefined,
          scope: "mcp:tools",
          created_at: now,
        });

        setCors(res);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          client_name: body.client_name ?? null,
          grant_types: ["client_credentials"],
          scope: "mcp:tools",
          client_id_issued_at: Math.floor(now / 1000),
          client_secret_expires_at: 0,
        }));
        return;
      }

      if (path === "/oauth/token" && method === "POST") {
        let raw: string;
        try {
          raw = await readBodyRaw(req);
        } catch (err) {
          sendJson(res, 400, { error: "invalid_request", error_description: err instanceof Error ? err.message : "Bad request" });
          return;
        }

        const params = parseTokenBody(raw, req.headers["content-type"]);

        if (params.grant_type !== "client_credentials") {
          sendJson(res, 400, { error: "unsupported_grant_type", error_description: "Only client_credentials grant type is supported." });
          return;
        }

        if (!params.client_id || !params.client_secret) {
          sendJson(res, 400, { error: "invalid_request", error_description: "client_id and client_secret are required." });
          return;
        }

        const client = oauthClients.get(params.client_id);
        if (!client || client.client_secret_hash !== hashSecret(params.client_secret)) {
          sendJson(res, 401, { error: "invalid_client", error_description: "Invalid client credentials." });
          return;
        }

        const accessToken = generateToken("bnrt_at");
        const now = Date.now();
        oauthTokens.set(accessToken, {
          token: accessToken,
          client_id: client.client_id,
          scope: client.scope,
          created_at: now,
          expires_at: now + TOKEN_TTL_MS,
        });

        sendJson(res, 200, {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: Math.floor(TOKEN_TTL_MS / 1000),
          scope: client.scope,
        });
        return;
      }

      if (path === "/health" && method === "GET") {
        sendJson(res, 200, {
          status: "ok",
          tools: TOOL_REGISTRY.length,
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
          active_sessions: sessions.size,
          reranker: process.env.COHERE_API_KEY ? "enabled" : "disabled (no COHERE_API_KEY)",
        });
        return;
      }

      if (path === "/api/tools" && method === "GET") {
        sendJson(res, 200, getToolManifest());
        return;
      }

      if (path === "/api/route" && method === "POST") {
        await handleRoute(req, res);
        return;
      }

      const toolMatch = path.match(/^\/api\/tools\/([a-z_]+)$/);
      if (toolMatch && method === "POST") {
        await handleToolCall(toolMatch[1], req, res);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error";
      console.error("[beneat-risk] HTTP error:", msg);
      if (!res.headersSent) {
        sendJson(res, 500, { error: msg });
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`[beneat-risk] HTTP server listening on port ${port}`);
    console.error(`[beneat-risk]   MCP endpoint:  http://localhost:${port}/mcp`);
    console.error(`[beneat-risk]   REST endpoint: POST http://localhost:${port}/api/tools/:name`);
    console.error(`[beneat-risk]   Tool manifest: GET  http://localhost:${port}/api/tools`);
    console.error(`[beneat-risk]   Health check:  GET  http://localhost:${port}/health`);
    console.error(`[beneat-risk]   Smart route:   POST http://localhost:${port}/api/route`);
    console.error(`[beneat-risk]   Auth:          ${AUTH_TOKEN ? "Bearer token required" : "open access"}`);
    console.error(`[beneat-risk]   Reranker:      ${process.env.COHERE_API_KEY ? "Cohere rerank-v4.0-fast" : "fallback (no COHERE_API_KEY)"}`);
  });

  return httpServer;
}

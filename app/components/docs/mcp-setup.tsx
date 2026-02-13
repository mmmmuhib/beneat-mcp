"use client";

import Link from "next/link";
import {
  DocSection,
  DocSubsection,
  CodeBlock,
  DataTable,
  Callout,
  TabGroup,
  Steps,
  Step,
  Accordion,
  InlineCode,
  DocDivider,
  SideNav,
  CardGrid,
} from "./primitives";

const NAV_ITEMS = [
  { id: "installation", label: "Installation" },
  { id: "mcp-config", label: "MCP Configuration" },
  { id: "env-vars", label: "Environment Variables" },
  { id: "agentwallet", label: "AgentWallet Setup" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "next-steps", label: "Next Steps" },
];

export function McpSetup() {
  return (
    <div className="relative flex gap-10">
      <div className="hidden w-48 shrink-0 xl:block">
        <SideNav items={NAV_ITEMS} />
      </div>

      <div className="min-w-0 max-w-4xl flex-1 space-y-10">
        {/* Installation */}
        <DocSection id="installation" title="Installation">
          <Steps>
            <Step number={1} title="Clone and build">
              <CodeBlock language="bash">{`git clone https://github.com/beneat-solana/beneat-solana-hackathon.git
cd beneat-solana-hackathon/mcp-server
npm install
npm run build`}</CodeBlock>
              <p>Compiles to <InlineCode>dist/</InlineCode>.</p>
            </Step>
            <Step number={2} title="Verify with the MCP Inspector">
              <CodeBlock language="bash">{`npm run inspect`}</CodeBlock>
              <p>
                Opens a browser UI to test all 19 tools. Verify they appear.
              </p>
            </Step>
            <Step number={3} title="Note the entry point path">
              <CodeBlock language="bash">{`echo "$(pwd)/dist/index.js"`}</CodeBlock>
              <p>You&#39;ll need this absolute path for MCP configuration.</p>
            </Step>
          </Steps>
        </DocSection>

        <DocDivider />

        {/* MCP Configuration */}
        <DocSection id="mcp-config" title="MCP Configuration">
          <TabGroup
            tabs={[
              {
                label: "Claude Desktop",
                content: (
                  <>
                    <p className="mb-3 text-xs text-[var(--text-secondary)]">
                      Add to <InlineCode>~/.claude/claude_desktop_config.json</InlineCode>:
                    </p>
                    <CodeBlock language="json">{`{
  "mcpServers": {
    "beneat-risk": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "HELIUS_API_KEY": "your-helius-key"
      }
    }
  }
}`}</CodeBlock>
                    <p className="text-xs text-[var(--text-muted)]">
                      Restart Claude Desktop. 19 tools should appear in the tool picker.
                    </p>
                  </>
                ),
              },
              {
                label: "Cursor",
                content: (
                  <>
                    <p className="mb-3 text-xs text-[var(--text-secondary)]">
                      Add to your project&#39;s <InlineCode>.cursor/mcp.json</InlineCode>:
                    </p>
                    <CodeBlock language="json">{`{
  "mcpServers": {
    "beneat-risk": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "HELIUS_API_KEY": "your-helius-key"
      }
    }
  }
}`}</CodeBlock>
                    <p className="text-xs text-[var(--text-muted)]">
                      Cursor Settings → MCP → verify connection.
                    </p>
                  </>
                ),
              },
              {
                label: "Custom Agent",
                content: (
                  <>
                    <p className="mb-3 text-xs text-[var(--text-secondary)]">
                      Connect programmatically using <InlineCode>@modelcontextprotocol/sdk</InlineCode>:
                    </p>
                    <CodeBlock language="typescript">{`import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/absolute/path/to/mcp-server/dist/index.js"],
  env: {
    ...process.env,
    SOLANA_RPC_URL: "https://api.devnet.solana.com",
    HELIUS_API_KEY: "your-helius-key",
  },
});

const client = new Client({ name: "my-trading-agent", version: "1.0.0" });
await client.connect(transport);

// Helper to call any Beneat tool
async function callTool(name, args) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.[0]?.text;
  return text ? JSON.parse(text) : response;
}

// Example: check if the agent can trade
const status = await callTool("beneat_get_status", {
  wallet_address: "YOUR_WALLET_ADDRESS",
});`}</CodeBlock>
                  </>
                ),
              },
            ]}
          />
        </DocSection>

        <DocDivider />

        {/* Environment Variables */}
        <DocSection id="env-vars" title="Environment Variables">
          <DataTable
            headers={["Variable", "Required", "Default", "Purpose"]}
            rows={[
              [
                "SOLANA_RPC_URL",
                "No",
                "https://api.devnet.solana.com",
                "Solana RPC endpoint",
              ],
              [
                "HELIUS_RPC_URL",
                "No",
                "Falls back to SOLANA_RPC_URL",
                "Alternative RPC via Helius",
              ],
              [
                "HELIUS_API_KEY",
                "For calibrate/analytics/coaching",
                "\u2014",
                "Helius enhanced transaction history API",
              ],
              [
                "SOL_PRICE_USD",
                "No",
                '"150"',
                "SOL price for AgentWallet USD limits",
              ],
            ]}
          />
          <Callout type="warning">
            Without <InlineCode>HELIUS_API_KEY</InlineCode>: Tier 1 calibration only. Coaching, analytics, playbook, and session strategy all require it.
          </Callout>
        </DocSection>

        <DocDivider />

        {/* AgentWallet Setup */}
        <DocSection id="agentwallet" title="AgentWallet Setup">
          <Accordion title="Optional — enables wallet-level freeze on lockout">
            <p className="mb-3">
              Without AgentWallet, enforcement is advisory only. With it, lockouts freeze the wallet.
            </p>
            <DocSubsection title="1. Start connection">
              <CodeBlock language="bash">{`curl -X POST https://agentwallet.mcpay.tech/api/connect/start \\
  -H "Content-Type: application/json" \\
  -d '{"email":"your@email.com"}'`}</CodeBlock>
            </DocSubsection>
            <DocSubsection title="2. Complete with OTP">
              <CodeBlock language="bash">{`curl -X POST https://agentwallet.mcpay.tech/api/connect/complete \\
  -H "Content-Type: application/json" \\
  -d '{"username":"YOUR_USERNAME","email":"your@email.com","otp":"123456"}'`}</CodeBlock>
            </DocSubsection>
            <DocSubsection title="3. Save credentials">
              <CodeBlock language="json">{`// ~/.agentwallet/config.json
{
  "apiToken": "mf_...",
  "username": "YOUR_USERNAME"
}`}</CodeBlock>
            </DocSubsection>
            <div className="mt-4 space-y-2">
              <p>
                <strong>Without:</strong> Tools return <InlineCode>approved: false</InlineCode> + <InlineCode>reasons[]</InlineCode>. On-chain vault guards still block rule violations.
              </p>
              <p>
                <strong>With:</strong> Lockout sets <InlineCode>max_per_tx_usd = 0</InlineCode>. Agent cannot sign any transaction until lockout expires.
              </p>
            </div>
          </Accordion>
        </DocSection>

        <DocDivider />

        {/* Troubleshooting */}
        <DocSection id="troubleshooting" title="Troubleshooting">
          <div className="space-y-2">
            <Accordion title="No vault found">
              <p>
                Run <InlineCode>beneat_calibrate</InlineCode> with deposit, strategy, and risk tolerance. Sign the returned unsigned TXs.
              </p>
            </Accordion>
            <Accordion title="AgentWallet config not found">
              <p>
                Create <InlineCode>~/.agentwallet/config.json</InlineCode> per the setup steps above. Without it, tools run advisory-only.
              </p>
            </Accordion>
            <Accordion title="Helius API errors / circuit breaker">
              <p>
                Circuit breaker opens after 3 failures. Wait 60s for retry. Verify <InlineCode>HELIUS_API_KEY</InlineCode> is valid.
              </p>
            </Accordion>
          </div>
        </DocSection>

        <DocDivider />

        {/* Next Steps */}
        <DocSection id="next-steps" title="Next Steps">
          <CardGrid>
            <Link href="/docs/mcp/integration" className="block border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 transition hover:border-[var(--border-hover)]">
              <h3 className="mb-1 text-sm font-semibold text-accent">
                Integration Patterns
              </h3>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Calibrate, trade, and choose integration depth.
              </p>
            </Link>
            <Link href="/docs/mcp/reference" className="block border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 transition hover:border-[var(--border-hover)]">
              <h3 className="mb-1 text-sm font-semibold text-accent">
                Tool Reference
              </h3>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                All 19 tools, demo, design principles, devnet addresses.
              </p>
            </Link>
          </CardGrid>
        </DocSection>
      </div>
    </div>
  );
}

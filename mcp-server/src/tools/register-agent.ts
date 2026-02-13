import { z } from "zod";

const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "http://localhost:3000";

export const registerAgentSchema = z.object({
  wallet: z
    .string()
    .describe("Solana wallet address (base58 public key)"),
  name: z
    .string()
    .describe("Agent name (2-50 characters)"),
  project_url: z
    .string()
    .optional()
    .describe("Project URL (e.g. GitHub repo)"),
  description: z
    .string()
    .optional()
    .describe("Short description of the trading agent (max 280 chars)"),
});

export async function registerAgent(
  input: z.infer<typeof registerAgentSchema>
): Promise<{
  success: boolean;
  wallet: string;
  name: string;
  status: string;
  error?: string;
}> {
  const body: Record<string, string> = {
    wallet: input.wallet,
    name: input.name,
  };
  if (input.project_url) body.project_url = input.project_url;
  if (input.description) body.description = input.description;

  const res = await fetch(`${NEXT_APP_URL}/api/leaderboard/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      success: false,
      wallet: input.wallet,
      name: input.name,
      status: "failed",
      error: data.error ?? `Registration failed (HTTP ${res.status})`,
    };
  }

  return {
    success: true,
    wallet: data.wallet,
    name: data.name ?? input.name,
    status: data.status ?? "tracked",
  };
}

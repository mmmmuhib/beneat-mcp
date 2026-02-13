import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface TrackedWallet {
  wallet: string;
  name: string;
  project_url: string | null;
  description: string | null;
  registered_at: string;
  status: "tracked";
}

interface TrackedWalletsFile {
  wallets: TrackedWallet[];
}

const WALLETS_PATH = join(process.cwd(), "data", "tracked-wallets.json");

function readWallets(): TrackedWalletsFile {
  try {
    const raw = readFileSync(WALLETS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { wallets: [] };
  }
}

function writeWallets(data: TrackedWalletsFile): void {
  writeFileSync(WALLETS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function isValidBase58Pubkey(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const projectUrl = typeof body.project_url === "string" ? body.project_url.trim() : null;
    const description = typeof body.description === "string" ? body.description.trim() : null;

    const errors: string[] = [];
    if (!wallet) {
      errors.push("wallet is required");
    } else if (!isValidBase58Pubkey(wallet)) {
      errors.push("wallet must be a valid Solana public key");
    }

    if (!name) {
      errors.push("name is required");
    } else if (name.length < 2 || name.length > 50) {
      errors.push("name must be 2-50 characters");
    }

    if (projectUrl && !isValidUrl(projectUrl)) {
      errors.push("project_url must be a valid URL");
    }

    if (description && description.length > 280) {
      errors.push("description must be 280 characters or less");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const data = readWallets();
    const existing = data.wallets.find((w) => w.wallet === wallet);
    if (existing) {
      return NextResponse.json(
        { error: "Wallet already registered", existing },
        { status: 409 }
      );
    }

    const entry: TrackedWallet = {
      wallet,
      name,
      project_url: projectUrl,
      description: description,
      registered_at: new Date().toISOString(),
      status: "tracked",
    };

    data.wallets.push(entry);
    writeWallets(data);

    return NextResponse.json({ success: true, wallet, name, status: "tracked" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register agent" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const data = readWallets();
    return NextResponse.json({
      wallets: data.wallets,
      total: data.wallets.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read tracked wallets" },
      { status: 500 }
    );
  }
}

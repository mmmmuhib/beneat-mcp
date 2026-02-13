"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const BS58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function WalletSearchBar() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    if (!BS58_RE.test(trimmed)) {
      setError("Invalid Solana address");
      return;
    }
    setError(null);
    router.push(`/leaderboard/${trimmed}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
          placeholder="Search wallet address..."
          className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-orange)] focus:outline-none transition-colors"
        />
        {error && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--loss-red)]">
            {error}
          </span>
        )}
      </div>
      <button
        type="submit"
        className="border border-[var(--accent-orange)] bg-[var(--accent-orange)]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-orange)] transition-colors hover:bg-[var(--accent-orange)]/20"
      >
        Scan
      </button>
    </form>
  );
}

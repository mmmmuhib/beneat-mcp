"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface RegisterModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function RegisterModal({ onClose, onSuccess }: RegisterModalProps) {
  const { publicKey } = useWallet();
  const [wallet, setWallet] = useState(publicKey?.toBase58() ?? "");
  const [name, setName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = { wallet, name };
      if (projectUrl.trim()) body.project_url = projectUrl.trim();
      if (description.trim()) body.description = description.trim();

      const res = await fetch("/api/leaderboard/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [wallet, name, projectUrl, description, onClose, onSuccess]);

  const canSubmit = wallet.length >= 32 && name.length >= 2 && !loading && !success;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md border border-[var(--border-color)] bg-[var(--bg-primary)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)] animate-glow-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                REGISTER AGENT
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm"
            >
              ESC
            </button>
          </div>

          <div className="space-y-4 p-4">
            {success && (
              <div className="border border-[var(--profit-green)]/30 bg-[var(--profit-green)]/5 px-3 py-2 text-xs text-[var(--profit-green)]">
                Agent registered successfully
              </div>
            )}

            {error && (
              <div className="border border-[var(--loss-red)]/30 bg-[var(--loss-red)]/5 px-3 py-2 text-xs text-[var(--loss-red)]">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                WALLET ADDRESS *
              </label>
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="Solana public key"
                className="w-full border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                AGENT NAME *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. DriftBot, SolanaTrader"
                maxLength={50}
                className="w-full border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                PROJECT URL
              </label>
              <input
                type="url"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                placeholder="https://github.com/your-project"
                className="w-full border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                DESCRIPTION
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of your trading agent"
                maxLength={280}
                rows={2}
                className="w-full resize-none border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:border-accent focus:outline-none"
              />
              <span className="mt-0.5 block text-right text-[9px] text-[var(--text-muted)]">
                {description.length}/280
              </span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full border px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                canSubmit
                  ? "border-accent bg-accent/10 text-accent hover:bg-accent/20"
                  : "border-[var(--border-color)] text-[var(--text-muted)] cursor-not-allowed"
              }`}
            >
              {loading ? "REGISTERING..." : success ? "REGISTERED" : "REGISTER AGENT"}
            </button>

            <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
              Registered agents appear on the leaderboard with a T (tracked) badge.
              Create a Beneat vault to upgrade to V (verified) status.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

import { SECONDS_PER_DAY } from "./constants.js";
import type { SessionTradeLog, SessionTrade, AdvisoryLimits, SessionState } from "./types.js";

const sessions = new Map<string, SessionTradeLog>();

export function getSession(wallet: string): SessionTradeLog {
  resetIfExpired(wallet);
  let session = sessions.get(wallet);
  if (!session) {
    session = {
      wallet,
      trades: [],
      dailyPnl: 0,
      tradeCount: 0,
      sessionStart: Math.floor(Date.now() / 1000),
      lastActivity: Math.floor(Date.now() / 1000),
    };
    sessions.set(wallet, session);
  }
  return session;
}

export function recordTrade(
  wallet: string,
  pnl: number,
  market?: string,
  confidence?: number
): SessionTradeLog {
  const session = getSession(wallet);
  const now = Math.floor(Date.now() / 1000);

  session.dailyPnl += pnl;
  session.tradeCount++;
  session.lastActivity = now;

  const trade: SessionTrade = {
    timestamp: now,
    pnl,
    market,
    cumPnl: session.dailyPnl,
    confidence,
  };
  session.trades.push(trade);

  return session;
}

export function resetIfExpired(wallet: string): void {
  const session = sessions.get(wallet);
  if (!session) return;

  const now = Math.floor(Date.now() / 1000);
  if (now - session.sessionStart >= SECONDS_PER_DAY) {
    sessions.set(wallet, {
      wallet,
      trades: [],
      dailyPnl: 0,
      tradeCount: 0,
      sessionStart: now,
      lastActivity: now,
    });
  }
}

export function clearSession(wallet: string): void {
  sessions.delete(wallet);
}

export function setAdvisoryLimits(wallet: string, limits: AdvisoryLimits): void {
  const session = getSession(wallet);
  session.advisoryLimits = limits;
}

export function setAdvisoryLockout(wallet: string, durationSeconds: number, reason: string): void {
  const session = getSession(wallet);
  session.lockoutUntil = Math.floor(Date.now() / 1000) + durationSeconds;
  session.lockoutReason = reason;
}

export function isAdvisoryLocked(wallet: string): { locked: boolean; reason?: string; remaining?: number } {
  const session = getSession(wallet);
  if (!session.lockoutUntil) return { locked: false };

  const now = Math.floor(Date.now() / 1000);
  if (now >= session.lockoutUntil) {
    session.lockoutUntil = undefined;
    session.lockoutReason = undefined;
    session.dailyPnl = 0;
    session.tradeCount = 0;
    session.trades = [];
    session.sessionStart = now;
    session.lastActivity = now;
    return { locked: false };
  }

  return {
    locked: true,
    reason: session.lockoutReason,
    remaining: session.lockoutUntil - now,
  };
}

export function getAllSessions(): Map<string, SessionTradeLog> {
  return sessions;
}

/**
 * Infer the current session state from the in-memory session store.
 * Uses only local session data (no on-chain calls) for speed.
 */
export function inferSessionState(wallet: string): SessionState {
  const lockout = isAdvisoryLocked(wallet);
  if (lockout.locked) return "post_lockout_recovery";

  const session = getSession(wallet);
  if (session.tradeCount === 0) return "normal";

  const recentTrades = session.trades.slice(-3);
  const recentLosses = recentTrades.filter((t) => t.pnl < 0).length;

  if (recentLosses >= 3) return "tilt";

  if (recentTrades[recentTrades.length - 1]?.pnl < 0) return "post_loss";

  const wins = session.trades.filter((t) => t.pnl > 0).length;
  const winRate = wins / session.tradeCount;
  if (winRate >= 0.7 && session.tradeCount >= 3) return "hot_streak";

  return "normal";
}

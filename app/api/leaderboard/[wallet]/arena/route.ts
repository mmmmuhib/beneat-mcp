import { NextResponse } from "next/server";
import { getArenaAgentDetail } from "../../../../lib/arena-agents";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;

  if (!wallet.startsWith("ARENA_")) {
    return NextResponse.json(
      { error: "Not an arena agent" },
      { status: 400 }
    );
  }

  const detail = getArenaAgentDetail(wallet);
  if (!detail) {
    return NextResponse.json(
      { error: "Arena agent not found" },
      { status: 404 }
    );
  }

  const isEnforced = wallet.startsWith("ARENA_ENF_");

  return NextResponse.json({
    wallet,
    name: isEnforced
      ? `${detail.profile.name} [Beneat]`
      : detail.profile.name,
    is_enforced: isEnforced,
    counterpart_wallet: detail.counterpartWallet,
    profile: {
      name: detail.profile.name,
      source: detail.profile.source,
      total_trades: detail.profile.totalTrades,
      win_rate: detail.profile.winRate,
      avg_win_pct: detail.profile.avgWinPct,
      avg_loss_pct: detail.profile.avgLossPct,
      avg_risk_reward: detail.profile.avgRiskReward,
      avg_position_size_pct: detail.profile.avgPositionSizePct,
      max_drawdown_pct: detail.profile.maxDrawdownPct,
      total_return_pct: detail.profile.totalReturnPct,
      starting_equity: detail.profile.startingEquity,
    },
    enforcement: {
      actual: detail.enforcement.actual,
      baseline_stats: detail.enforcement.baseline.stats,
      enforced_stats: detail.enforcement.enforced.stats,
      methodology: detail.enforcement.methodology,
      intervention_count: detail.enforcement.interventions.length,
      interventions_by_type: {
        stop_loss: detail.enforcement.interventions.filter((i) => i.type === "stop_loss").length,
        cooldown: detail.enforcement.interventions.filter((i) => i.type === "cooldown").length,
        lockout: detail.enforcement.interventions.filter((i) => i.type === "lockout").length,
        tilt_reduction: detail.enforcement.interventions.filter((i) => i.type === "tilt_reduction").length,
        post_loss_reduction: detail.enforcement.interventions.filter((i) => i.type === "post_loss_reduction").length,
      },
    },
    trades: detail.profile.rawTrades.slice(0, 50).map((t) => ({
      symbol: t.symbol,
      entry_price: t.entryPrice,
      exit_price: t.exitPrice,
      shares: t.shares,
      pnl: t.pnl,
      pnl_pct: t.pnlPct,
      entry_date: t.entryDate,
      exit_date: t.exitDate,
    })),
  });
}

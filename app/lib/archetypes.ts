export type Archetype =
  | "Specter"
  | "Apex"
  | "Phantom"
  | "Sentinel"
  | "Ironclad"
  | "Swarm"
  | "Rogue"
  | "Glitch"
  | "Unclassed";

export interface ArchetypeResult {
  archetype: Archetype;
  color: string;
  narrative: string;
}

interface AgentStats {
  discipline: number;
  patience: number;
  consistency: number;
  timing: number;
  risk_control: number;
  endurance: number;
  overall_rating: number;
  total_trades: number;
  lockout_count: number;
  win_rate: number;
  trading_days: number;
  uses_light_protocol?: boolean;
}

const ARCHETYPE_COLORS: Record<Archetype, string> = {
  Specter: "#f0f0f0",
  Apex: "#ffd700",
  Phantom: "#a855f7",
  Sentinel: "#3b82f6",
  Ironclad: "#9ca3af",
  Swarm: "#06b6d4",
  Rogue: "#ef4444",
  Glitch: "#ec4899",
  Unclassed: "#52525b",
};

function buildNarrative(archetype: Archetype, s: AgentStats): string {
  const templates: Record<Archetype, string> = {
    Specter: `Disciplined AND invisible. The ghost trader. Operates in the shadows with a discipline score of ${s.discipline}. You won't see them coming.`,
    Apex: `Peak performance. The complete agent. Rating of ${s.overall_rating} puts them at the top across every dimension. ${s.total_trades} trades, ${(s.win_rate * 100).toFixed(1)}% win rate.`,
    Phantom: `Silent. Precise. Appears, extracts, vanishes. ${(s.win_rate * 100).toFixed(1)}% win rate across just ${s.total_trades} trades. The vault barely notices they're there.`,
    Sentinel: `The vault never fires because they never cross the line. Discipline of ${s.discipline} with only ${s.lockout_count} lockout(s). A model of restraint.`,
    Ironclad: `Enters conviction positions. Doesn't flinch. ${s.trading_days} days active with ${s.endurance} endurance. Built to last.`,
    Swarm: `Volume is the strategy. ${s.total_trades} trades with ${s.consistency} consistency. Thousands of micro-edges compounding into results.`,
    Rogue: `Pushes every boundary. Discipline of ${s.discipline} across ${s.total_trades} trades — the vault works overtime. ${s.lockout_count} lockouts and counting.`,
    Glitch: `Unpredictable. ${s.lockout_count} lockouts, ${s.discipline} discipline. The vault exists for agents like this.`,
    Unclassed: `Insufficient data to classify. ${s.total_trades} trades across ${s.trading_days} days. Keep trading to earn an archetype.`,
  };
  return templates[archetype];
}

export function classifyArchetype(stats: AgentStats): ArchetypeResult {
  const s = stats;

  let archetype: Archetype = "Unclassed";

  if (s.uses_light_protocol && s.discipline >= 70) {
    archetype = "Specter";
  } else if (s.overall_rating >= 90) {
    archetype = "Apex";
  } else if (s.discipline >= 80 && s.patience >= 75 && s.total_trades < 50) {
    archetype = "Phantom";
  } else if (s.discipline >= 80 && s.risk_control >= 75 && s.lockout_count <= 1) {
    archetype = "Sentinel";
  } else if (s.endurance >= 80 && s.consistency >= 75 && s.trading_days >= 30) {
    archetype = "Ironclad";
  } else if (s.total_trades >= 200 && s.consistency >= 70) {
    archetype = "Swarm";
  } else if (s.discipline < 40 && s.total_trades >= 50) {
    archetype = "Rogue";
  } else if (s.lockout_count >= 5 || (s.discipline < 30 && s.consistency < 30)) {
    archetype = "Glitch";
  }

  return {
    archetype,
    color: ARCHETYPE_COLORS[archetype],
    narrative: buildNarrative(archetype, s),
  };
}

export function getArchetypeColor(archetype: Archetype): string {
  return ARCHETYPE_COLORS[archetype];
}

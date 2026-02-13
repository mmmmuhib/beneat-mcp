"use client";

import { RotateCcw } from "lucide-react";
import type { SimulatorParams } from "./simulation-logic";

const SCENARIO_OPTIONS = [10, 25, 50, 100, 200] as const;

interface SimulatorControlsProps {
  params: SimulatorParams;
  onParamsChange: (params: SimulatorParams) => void;
  onRerun: () => void;
  scenarioCount?: number;
  onScenarioCountChange?: (count: number) => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  prefix?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  prefix = "",
  formatValue,
  onChange,
}: SliderProps) {
  const displayValue = formatValue
    ? formatValue(value)
    : `${prefix}${value.toLocaleString()}${unit}`;

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {label}
        </label>
        <span className="font-mono text-sm font-medium text-primary">
          {displayValue}
        </span>
      </div>
      <div className="relative flex h-6 items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary/50 transition-all duration-100"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-x-0 h-6 w-full cursor-pointer opacity-0"
        />
        <div
          className="pointer-events-none absolute h-3 w-3 rounded-full bg-primary shadow-lg shadow-primary/30 transition-all duration-100"
          style={{ left: `calc(${percentage}% - 6px)` }}
        />
      </div>
    </div>
  );
}

function ScenarioCountSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="flex overflow-hidden border border-border">
      {SCENARIO_OPTIONS.map((count, index) => (
        <button
          key={count}
          onClick={() => onChange(count)}
          className={`flex-1 px-2 py-2 font-mono text-xs transition-all duration-200 ${
            value === count
              ? "border-primary/30 bg-primary/15 text-primary"
              : "text-text-secondary hover:bg-card hover:text-foreground"
          } ${index !== 0 ? "border-l border-border" : ""}`}
        >
          {count}
        </button>
      ))}
    </div>
  );
}

export function SimulatorControls({
  params,
  onParamsChange,
  onRerun,
  scenarioCount = 50,
  onScenarioCountChange,
}: SimulatorControlsProps) {
  const updateParam = <K extends keyof SimulatorParams>(
    key: K,
    value: SimulatorParams[K]
  ) => {
    onParamsChange({ ...params, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Parameters
        </span>
      </div>

      <div className="space-y-5">
        <Slider
          label="Win Rate"
          value={params.winRate}
          min={10}
          max={90}
          step={1}
          unit="%"
          onChange={(v) => updateParam("winRate", v)}
        />

        <Slider
          label="Risk : Reward"
          value={params.riskReward}
          min={0.5}
          max={5}
          step={0.5}
          formatValue={(v) => `1:${v}`}
          onChange={(v) => updateParam("riskReward", v)}
        />

        <Slider
          label="Position Size"
          value={params.positionSize}
          min={0.5}
          max={10}
          step={0.5}
          unit="%"
          onChange={(v) => updateParam("positionSize", v)}
        />

        <Slider
          label="Starting Balance"
          value={params.startingBalance}
          min={1000}
          max={100000}
          step={1000}
          prefix="$"
          onChange={(v) => updateParam("startingBalance", v)}
        />

        <Slider
          label="Number of Trades"
          value={params.numTrades}
          min={20}
          max={500}
          step={10}
          onChange={(v) => updateParam("numTrades", v)}
        />
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {onScenarioCountChange && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Monte Carlo Scenarios
            </span>
          </div>
          <ScenarioCountSelector
            value={scenarioCount}
            onChange={onScenarioCountChange}
          />
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            Run {scenarioCount} simulations with identical parameters to see the
            range of possible outcomes.
          </p>
        </div>
      )}

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <button
        onClick={onRerun}
        className="flex w-full items-center justify-center gap-2 border border-primary/30 bg-primary/10 px-4 py-3 transition-all duration-200 hover:border-primary/50 hover:bg-primary/20"
      >
        <RotateCcw className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs uppercase tracking-wider text-primary">
          Re-run Simulation
        </span>
      </button>
    </div>
  );
}

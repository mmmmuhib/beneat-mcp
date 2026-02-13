"use client";

import { useState, useMemo, useCallback } from "react";
import {
  type SimulatorParams,
  DEFAULT_PARAMS,
  runMonteCarloWithCurves,
} from "./simulation-logic";
import { SimulatorControls } from "./simulator-controls";
import { MonteCarloChart, MonteCarloLegend } from "./monte-carlo-chart";
import { MonteCarloStats } from "./monte-carlo-stats";

export function EquityCurveSimulator() {
  const [params, setParams] = useState<SimulatorParams>(DEFAULT_PARAMS);
  const [scenarioCount, setScenarioCount] = useState<number>(50);
  const [seed, setSeed] = useState<number>(0);

  const regenerateSimulations = useCallback(() => {
    setSeed((s) => s + 1);
  }, []);

  const handleParamsChange = useCallback((newParams: SimulatorParams) => {
    setParams(newParams);
  }, []);

  const handleScenarioCountChange = useCallback((count: number) => {
    setScenarioCount(count);
  }, []);

  const monteCarloResult = useMemo(() => {
    void seed;
    return runMonteCarloWithCurves(params, scenarioCount);
  }, [params, scenarioCount, seed]);

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <div className="mb-4 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-primary/70">
            monte carlo analysis
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
        </div>

        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground">
          Same parameters, different outcomes.{" "}
          <span className="text-primary">See the variance.</span>
        </h2>

        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-text-secondary">
          Run {scenarioCount} simulations with identical settings to understand
          how randomness affects your results. The spread shows parameter
          stability.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SimulatorControls
              params={params}
              onParamsChange={handleParamsChange}
              onRerun={regenerateSimulations}
              scenarioCount={scenarioCount}
              onScenarioCountChange={handleScenarioCountChange}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">
                  Parameter Stability
                </span>
              </div>
              <span className="font-mono text-[10px] text-text-muted">
                {scenarioCount} scenarios · {params.numTrades} trades each
              </span>
            </div>

            <div className="p-4">
              <MonteCarloChart
                result={monteCarloResult}
                startingBalance={params.startingBalance}
                height={320}
              />
            </div>

            <MonteCarloLegend
              result={monteCarloResult}
              startingBalance={params.startingBalance}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card">
            <div className="border-b border-primary/10 bg-primary/5 px-4 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
                Monte Carlo Statistics
              </span>
            </div>
            <MonteCarloStats
              result={monteCarloResult}
              scenarioCount={scenarioCount}
            />
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              <div>
                <p className="mb-2 text-sm leading-relaxed text-text-secondary">
                  <span className="font-medium text-primary">
                    Parameter stability insight:
                  </span>{" "}
                  A tight spread between best and worst cases means your
                  parameters are robust. Wide spreads indicate high variance -
                  you might win big or lose big depending on luck.
                </p>
                <p className="text-[11px] text-text-muted">
                  Look for strategies where even the worst-case scenario is
                  acceptable.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="border-bloomberg bg-bloomberg-secondary p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-loss">■</span>
            <span className="text-bloomberg-label text-loss">COMPONENT ERROR</span>
          </div>
          <p className="text-bloomberg-label text-[var(--text-muted)] mb-3">
            {this.state.error?.message || "AN UNEXPECTED ERROR OCCURRED"}
          </p>
          <button
            onClick={this.handleReset}
            className="border-bloomberg bg-bloomberg-tertiary px-3 py-1.5 text-bloomberg-label text-accent transition hover:bg-[var(--border-color)]"
          >
            RETRY
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface ChartErrorFallbackProps {
  onRetry: () => void;
}

export function ChartErrorFallback({ onRetry }: ChartErrorFallbackProps) {
  return (
    <div className="flex h-[400px] items-center justify-center border-bloomberg bg-bloomberg-secondary">
      <div className="text-center">
        <div className="mb-4 text-loss">■ CHART UNAVAILABLE</div>
        <p className="text-bloomberg-label text-[var(--text-muted)] mb-4">
          FAILED TO LOAD PRICE CHART
        </p>
        <button
          onClick={onRetry}
          className="border-bloomberg bg-bloomberg-tertiary px-4 py-2 text-bloomberg-label text-accent transition hover:bg-[var(--border-color)]"
        >
          RELOAD CHART
        </button>
      </div>
    </div>
  );
}

interface PositionsErrorFallbackProps {
  onRetry: () => void;
}

export function PositionsErrorFallback({ onRetry }: PositionsErrorFallbackProps) {
  return (
    <div className="border-bloomberg bg-bloomberg-secondary p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-loss">■</span>
        <span className="text-bloomberg-label text-loss">POSITIONS UNAVAILABLE</span>
      </div>
      <p className="text-bloomberg-label text-[var(--text-muted)] mb-4">
        FAILED TO LOAD OPEN POSITIONS
      </p>
      <button
        onClick={onRetry}
        className="border-bloomberg bg-bloomberg-tertiary px-4 py-2 text-bloomberg-label text-accent transition hover:bg-[var(--border-color)]"
      >
        RELOAD POSITIONS
      </button>
    </div>
  );
}

interface OrderFormErrorFallbackProps {
  onRetry: () => void;
}

export function OrderFormErrorFallback({ onRetry }: OrderFormErrorFallbackProps) {
  return (
    <div className="border-bloomberg bg-bloomberg-secondary p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-loss">■</span>
        <span className="text-bloomberg-label text-loss">ORDER FORM ERROR</span>
      </div>
      <p className="text-bloomberg-label text-[var(--text-muted)] mb-4">
        TRADING FORM TEMPORARILY UNAVAILABLE
      </p>
      <button
        onClick={onRetry}
        className="border-bloomberg bg-bloomberg-tertiary px-4 py-2 text-bloomberg-label text-accent transition hover:bg-[var(--border-color)]"
      >
        RELOAD FORM
      </button>
    </div>
  );
}

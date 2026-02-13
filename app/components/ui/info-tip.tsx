"use client";

import { Info } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface InfoTipProps {
  children: React.ReactNode;
  tip: string;
  align?: "center" | "left" | "right";
}

export function InfoTip({ children, tip, align = "center" }: InfoTipProps) {
  const [visible, setVisible] = useState(false);
  const [above, setAbove] = useState(true);
  const iconRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setAbove(rect.top > 120);
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  const positionClasses = above
    ? "bottom-full mb-1.5"
    : "top-full mt-1.5";

  const alignClasses =
    align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span
        ref={iconRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Info
          className="h-3 w-3 shrink-0 cursor-help text-[var(--text-muted)] opacity-60"
          aria-hidden="true"
        />
        {visible && (
          <span
            role="tooltip"
            className={`pointer-events-none absolute z-50 w-max max-w-[320px] border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 shadow-lg ${positionClasses} ${alignClasses}`}
            style={{
              fontSize: "0.6875rem",
              lineHeight: 1.5,
              fontWeight: 300,
              textTransform: "none",
              letterSpacing: "0.01em",
              color: "var(--text-secondary)",
            }}
          >
            {tip}
          </span>
        )}
      </span>
    </span>
  );
}

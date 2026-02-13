"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-6 flex items-center gap-3 text-lg font-bold uppercase tracking-wider text-[var(--text-primary)]">
        <span className="text-accent">//</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DocSubsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function CodeBlock({
  title,
  language,
  children,
}: {
  title?: string;
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4 border border-[var(--border-color)] bg-[var(--bg-primary)]">
      {(title || language) && (
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {title || language}
          </span>
          <button
            onClick={handleCopy}
            className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] opacity-0 transition hover:text-accent group-hover:opacity-100"
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
        <code>{children}</code>
      </pre>
      {!title && !language && (
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] opacity-0 transition hover:text-accent group-hover:opacity-100"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      )}
    </div>
  );
}

export function DataTable({
  headers,
  rows,
  compact,
}: {
  headers: string[];
  rows: (string | ReactNode)[][];
  compact?: boolean;
}) {
  return (
    <div className="my-4 overflow-x-auto border border-[var(--border-color)]">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
            {headers.map((h) => (
              <th
                key={h}
                className={`${compact ? "px-3 py-1.5" : "px-4 py-2"} text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--border-color)] last:border-0"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`${compact ? "px-3 py-1.5" : "px-4 py-2.5"} ${j === 0 ? "font-mono text-xs text-accent" : "text-xs text-[var(--text-secondary)]"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({
  type,
  title,
  children,
}: {
  type: "info" | "warning" | "tip";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: {
      border: "border-[var(--accent-cyan)]",
      bg: "bg-[var(--accent-cyan)]/5",
      icon: "text-[var(--accent-cyan)]",
      label: "INFO",
    },
    warning: {
      border: "border-[var(--accent-amber)]",
      bg: "bg-[var(--accent-amber)]/5",
      icon: "text-[var(--accent-amber)]",
      label: "WARNING",
    },
    tip: {
      border: "border-[var(--accent-violet)]",
      bg: "bg-[var(--accent-violet)]/5",
      icon: "text-[var(--accent-violet)]",
      label: "TIP",
    },
  };

  const s = styles[type];

  return (
    <div className={`my-4 border-l-2 ${s.border} ${s.bg} p-4`}>
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${s.icon}`}
        >
          {title || s.label}
        </span>
      </div>
      <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </div>
  );
}

export function TabGroup({
  tabs,
}: {
  tabs: { label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(0);

  return (
    <div className="my-4 border border-[var(--border-color)]">
      <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-[11px] font-medium uppercase tracking-wider transition ${
              active === i
                ? "border-b-2 border-accent bg-[var(--bg-secondary)] text-accent"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-4">{tabs[active].content}</div>
    </div>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <div className="my-4 space-y-0">{children}</div>;
}

export function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative border-l-2 border-[var(--border-color)] pb-6 pl-6 last:border-transparent last:pb-0">
      <div className="absolute -left-[11px] top-0 flex h-5 w-5 items-center justify-center border border-[var(--border-color)] bg-[var(--bg-secondary)] font-mono text-[10px] text-accent">
        {number}
      </div>
      <h4 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </h4>
      <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </div>
  );
}

export function Accordion({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-[var(--border-color)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-[var(--bg-tertiary)]"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {title}
        </span>
        <svg
          className={`h-3 w-3 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[var(--border-color)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
          {children}
        </div>
      )}
    </div>
  );
}

export function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 transition hover:border-[var(--border-hover)]">
      <div className="mb-3 flex h-8 w-8 items-center justify-center text-accent">
        {icon}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {children}
    </div>
  );
}

export function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[11px] text-accent">
      {children}
    </code>
  );
}

export function DocDivider() {
  return <hr className="my-10 border-[var(--border-color)]" />;
}

export function SideNav({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  return (
    <nav className="sticky top-20 hidden space-y-1 xl:block">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        On this page
      </span>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="block py-1 text-[11px] text-[var(--text-muted)] transition hover:text-accent"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function DocTabNav({
  tabs,
}: {
  tabs: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <div className="mb-8 flex border-b border-[var(--border-color)]">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/docs/mcp"
            ? pathname === "/docs/mcp"
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider transition ${
              isActive
                ? "border-b-2 border-accent text-accent"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

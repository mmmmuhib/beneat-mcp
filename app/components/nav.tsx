"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TERMINAL_URL = "https://app.beneat.ai";

const NAV_LINKS = [
  { href: "/lab", label: "LAB" },
  { href: "/leaderboard", label: "BOARD" },
  { href: "/docs/mcp", label: "DOCS" },
] as const;

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TerminalCTA() {
  return (
    <a
      href={TERMINAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm tracking-[0.5em] uppercase font-light text-orange-400/80 hover:text-orange-400 transition-colors"
    >
      Terminal
    </a>
  );
}

function NavLink({
  href,
  label,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-xs font-light uppercase tracking-[0.3em] transition-colors ${
        isActive
          ? "text-white/95 border-b border-white/95"
          : "text-white/40 hover:text-white/70"
      }`}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50">
      <div className="relative border-b border-[var(--border-color)] bg-bloomberg-secondary">
        <nav className="relative mx-auto grid h-12 max-w-7xl grid-cols-3 items-center px-4 sm:px-6">
          {/* Left: Beneat wordmark */}
          <div className="flex items-center">
            <Link
              href="/"
              className="transition hover:opacity-80"
              aria-label="Beneat home"
            >
              <span className="text-sm tracking-[0.5em] text-white/95 uppercase font-light">
                Beneat
              </span>
            </Link>
          </div>

          {/* Center: Nav links */}
          <div className="hidden items-center justify-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                isActive={pathname.startsWith(link.href)}
              />
            ))}
          </div>

          {/* Right: Terminal CTA + Mobile menu */}
          <div className="flex items-center justify-end gap-3">
            <div className="hidden sm:block">
              <TerminalCTA />
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="border border-bloomberg p-1.5 text-[var(--text-secondary)] transition hover:border-[var(--accent-orange)] hover:text-accent md:hidden"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="border-b border-[var(--border-color)] bg-bloomberg-secondary md:hidden">
          <div className="mx-auto max-w-7xl space-y-3 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                isActive={pathname.startsWith(link.href)}
                onClick={() => setMobileMenuOpen(false)}
              />
            ))}

            <div className="flex items-center justify-end border-t border-[var(--border-color)] pt-3">
              <TerminalCTA />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

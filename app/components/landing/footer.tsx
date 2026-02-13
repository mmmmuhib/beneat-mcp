"use client";

import { Github, Twitter, MessageCircle } from "lucide-react";

const socialLinks = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: MessageCircle, label: "Discord", href: "#" },
  { icon: Github, label: "GitHub", href: "#" },
];

const footerLinks = [
  { label: "Features", href: "#features" },
  { label: "Privacy", href: "#" },
  { label: "Documentation", href: "#" },
  { label: "Contact", href: "#" },
];

export function Footer() {
  return (
    <footer className="relative bg-[#0a0a0b] border-t border-white/10">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <span className="text-xl tracking-[0.3em] text-white/90 uppercase font-light">
              Beneat
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Social */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                className="w-9 h-9 border border-white/10 hover:border-orange-500/30 flex items-center justify-center text-white/40 hover:text-orange-400 transition-all"
                aria-label={social.label}
              >
                <social.icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-white/30">
            © 2026 Beneat
          </p>
          <p className="text-xs text-white/20">
            Built on Solana
          </p>
        </div>
      </div>
    </footer>
  );
}

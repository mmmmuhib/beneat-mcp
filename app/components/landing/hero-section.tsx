"use client";

import { useRef } from "react";
import { ArrowRight, Search } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useWalletConnection } from "@solana/react-hooks";


function ScanButton() {
  const { wallet, status } = useWalletConnection();
  const address = status === "connected" ? wallet?.account.address.toString() : null;

  return (
    <Link
      href={address ? `/leaderboard/${address}` : "/leaderboard"}
      className="group relative flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-light uppercase tracking-[0.2em] text-sm rounded-lg overflow-hidden transition-all duration-300 hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] hover:-translate-y-0.5"
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-full top-0 w-full h-full bg-gradient-to-r from-transparent via-white/15 to-transparent animate-[shimmer_3s_ease-in-out_infinite]" />
      </div>

      {/* Pulse ring */}
      <div className="absolute inset-0 rounded-lg animate-[pulse-glow_2s_ease-in-out_infinite] pointer-events-none" />

      <div className="relative flex items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        </div>
        {address ? "View Your Agent" : "Explore Agents"}
      </div>
    </Link>
  );
}

const staggerChildren = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.3,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1] as const, // ease-out-expo
    },
  },
};

export function HeroSection() {
  const containerRef = useRef(null);
  const { scrollY } = useScroll();
  const contentOpacity = useTransform(scrollY, [0, 300], [1, 0.3]);

  return (
    <section ref={containerRef} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0b]">
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px"
        }}
      />

      {/* Gradient blurs */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[var(--accent-orange)]/5 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-[150px]" />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 50% 50% at 50% 45%, transparent 35%, rgba(10, 10, 11, 0.6) 60%, rgba(10, 10, 11, 0.95) 100%),
            linear-gradient(to bottom, rgba(10, 10, 11, 0.3) 0%, transparent 30%, transparent 70%, rgba(10, 10, 11, 0.5) 100%)
          `,
        }}
      />

      {/* Corner decorative borders */}
      <div className="absolute top-8 left-8 w-4 h-4 border-l border-t border-[var(--border-color)]" />
      <div className="absolute top-8 right-8 w-4 h-4 border-r border-t border-[var(--border-color)]" />
      <div className="absolute bottom-8 left-8 w-4 h-4 border-l border-b border-[var(--border-color)]" />
      <div className="absolute bottom-8 right-8 w-4 h-4 border-r border-b border-[var(--border-color)]" />

      <motion.div
        style={{ opacity: contentOpacity }}
        className="relative z-10 w-full max-w-6xl mx-auto px-6 py-20"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-8">
          {/* Left: Content */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerChildren}
            className="flex flex-col items-start"
          >
            <motion.span variants={fadeUp} className="text-terminal-hero">
              Beneat
            </motion.span>

            <motion.h1 variants={fadeUp} className="text-terminal-heading mt-4">
              infrastructure for private, accountable, and disciplined trading
            </motion.h1>

            <motion.p variants={fadeUp} className="text-terminal-body mt-3">
              On-chain risk enforcement via neural behavioral analysis
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 mt-6">
              <ScanButton />
              <Link
                href="/lab"
                className="group relative flex items-center gap-3 px-6 py-3.5 text-white/80 font-light uppercase tracking-[0.2em] text-sm rounded-lg border border-white/15 transition-all duration-300 hover:border-orange-500/50 hover:text-white hover:shadow-[0_0_20px_rgba(249,115,22,0.1)] hover:-translate-y-0.5"
              >
                Enter the Lab
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
              </Link>

            </motion.div>



          </motion.div>

          {/* Right: Brain image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.0, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="hidden sm:flex items-center justify-center"
          >
            <div className="relative w-full max-w-md aspect-square">
              <Image
                src="/brains.png"
                alt="Neural network brain visualization"
                fill
                priority
                className="object-contain drop-shadow-[0_0_60px_rgba(249,115,22,0.3)]"
              />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

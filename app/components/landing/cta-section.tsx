"use client";

import { useRef } from "react";
import { ArrowRight, Shield, Zap, Lock } from "lucide-react";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import Link from "next/link";

function AnimatedStat({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const springValue = useSpring(0, {
    stiffness: 50,
    damping: 20,
    duration: 2000
  });

  if (isInView) {
    springValue.set(value);
  }

  const displayValue = useTransform(springValue, (latest) => {
    if (value >= 1000000) {
      return `${(latest / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${Math.floor(latest).toLocaleString()}`;
    }
    return `${Math.floor(latest)}`;
  });

  return (
    <div ref={ref} className="text-center">
      <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
        <motion.span>{displayValue}</motion.span>
        {suffix}
      </div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export function CTASection() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  const benefits = [
    { icon: Shield, text: "Free to use" },
    { icon: Zap, text: "Setup in 2 minutes" },
  ];

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 bg-[#0a0a0b]">
      <div className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px"
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] rounded-full bg-gradient-radial from-orange-500/8 via-violet-500/4 to-transparent blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative border border-white/10 overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-orange-500/60 via-violet-500/60 to-cyan-500/60" />

          <div className="relative p-8 sm:p-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-sm text-white/60">Join 2,847+ traders</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-2xl sm:text-3xl md:text-4xl text-white mb-4 font-light tracking-wide"
            >
              Stop Letting Emotions
              <br />
              <span className="text-orange-400">Destroy Your Portfolio</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-white/40 max-w-md mx-auto mb-8 text-sm leading-relaxed"
            >
              70% of traders lose money from bad behavior, not bad trades.
              Let the blockchain enforce your discipline.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex justify-center gap-6 mb-8"
            >
              {benefits.map((benefit) => (
                <div key={benefit.text} className="flex items-center gap-2 text-white/50">
                  <benefit.icon className="w-4 h-4 text-orange-400/70" />
                  <span className="text-sm">{benefit.text}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="flex flex-col items-center gap-3"
            >
              <Link href="/lab" className="group flex items-center gap-2 px-8 py-3.5 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-all">
                Enter the Lab
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/leaderboard"
                className="group flex items-center gap-2 text-orange-400/70 hover:text-orange-400 text-sm transition-colors"
              >
                <span>Explore Leaderboard</span>
              </Link>

              <a
                href="https://app.beneat.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 px-8 py-3.5 border border-orange-500/40 hover:border-orange-500/80 text-orange-400/80 hover:text-orange-400 text-sm tracking-wide transition-all hover:shadow-[0_0_30px_rgba(249,115,22,0.15)]"
              >
                <Lock className="w-4 h-4" />
                <span>Open Terminal</span>
                <span className="px-1.5 py-0.5 bg-orange-500/20 border border-orange-500/30 text-[8px] font-bold uppercase tracking-widest">PRO</span>
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="mt-12 pt-8 border-t border-white/10 grid grid-cols-3 gap-8"
            >
              <AnimatedStat value={2400000} suffix="+" label="Total Value Locked" />
              <AnimatedStat value={12847} suffix="" label="Lockouts Enforced" />
              <AnimatedStat value={340} suffix="" label="Avg Loss Prevented" />
            </motion.div>
          </div>

          <div className="absolute top-0 left-0 w-3 h-3 border-l border-t border-white/20" />
          <div className="absolute top-0 right-0 w-3 h-3 border-r border-t border-white/20" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-white/20" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-white/20" />
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { Wallet, Brain, Shield, Lock, TrendingUp } from "lucide-react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";

const steps = [
  {
    icon: Wallet,
    title: "Connect & Deposit",
    description: "Deposit funds into your personal risk vault. You maintain full custody.",
  },
  {
    icon: Brain,
    title: "Analyze History",
    description: "We scan your on-chain data to generate your unique Trader DNA card.",
  },
  {
    icon: Shield,
    title: "Set Your Rules",
    description: "Configure loss limits and cooldown periods. The blockchain enforces them.",
  },
  {
    icon: TrendingUp,
    title: "Trade Through Vault",
    description: "Execute via Drift Protocol with pre-trade validation and ghost orders.",
  },
  {
    icon: Lock,
    title: "Auto-Lock & Privacy",
    description: "When limits hit, vault locks. P&L settles privately via Light Protocol.",
  },
];

export function HowItWorks() {
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true, margin: "-100px" });

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"]
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={containerRef} className="relative py-24 lg:py-32 bg-[#0a0a0b]">
      <div className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px"
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center mb-16"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-orange-500/60" />
            <span className="text-xs uppercase tracking-[0.2em] text-orange-400">Getting Started</span>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-orange-500/60" />
          </div>

          <h2 className="text-2xl sm:text-3xl text-white font-light tracking-wide mb-4">
            How Beneat{" "}
            <span className="text-orange-400">Works</span>
          </h2>

          <p className="text-white/40 text-sm max-w-md mx-auto">
            From deposit to disciplined trading in five steps.
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-6 top-4 bottom-4 w-px bg-white/5 hidden md:block">
            <motion.div
              className="w-full bg-gradient-to-b from-orange-500/60 via-violet-500/60 to-cyan-500/60"
              style={{ height: lineHeight }}
            />
          </div>

          <div className="space-y-12">
            {steps.map((step, index) => (
              <StepItem key={step.title} step={step} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepItem({ step, index }: { step: typeof steps[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const colors = ["text-orange-400", "text-violet-400", "text-cyan-400", "text-orange-400", "text-violet-400"];
  const bgColors = ["bg-orange-500/10", "bg-violet-500/10", "bg-cyan-500/10", "bg-orange-500/10", "bg-violet-500/10"];
  const borderColors = ["border-orange-500/30", "border-violet-500/30", "border-cyan-500/30", "border-orange-500/30", "border-violet-500/30"];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className="relative flex gap-6"
    >
      <motion.div
        initial={{ scale: 0.8, rotate: -10 }}
        animate={isInView ? { scale: 1, rotate: 0 } : {}}
        transition={{
          duration: 0.4,
          delay: index * 0.1 + 0.1,
          type: "spring",
          stiffness: 200
        }}
        className={`relative shrink-0 w-12 h-12 ${bgColors[index]} border ${borderColors[index]} flex items-center justify-center`}
      >
        <step.icon className={`w-5 h-5 ${colors[index]}`} />
        <span className={`absolute -top-1 -right-1 w-5 h-5 ${bgColors[index]} border ${borderColors[index]} flex items-center justify-center text-[10px] font-bold ${colors[index]}`}>
          {index + 1}
        </span>
      </motion.div>

      <div className="flex-1 pt-1">
        <h3 className="text-lg text-white mb-1 font-light">{step.title}</h3>
        <p className="text-sm text-white/40 leading-relaxed">{step.description}</p>
      </div>
    </motion.div>
  );
}

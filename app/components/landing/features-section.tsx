"use client";

import { useRef, useEffect, useState } from "react";
import { Shield, Lock, Ghost, BarChart3 } from "lucide-react";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";

const features = [
  {
    icon: Shield,
    title: "Risk Enforcement",
    subtitle: "Autonomous Protection",
    description: "Your rules become code. The vault locks automatically when limits are breached—no hesitation, no override.",
    mechanism: "Smart contract monitors every trade. Breach = instant lock.",
    color: "orange",
    threat: "Emotional Override",
    trigger: "Prevents $1,247 avg loss",
  },
  {
    icon: Lock,
    title: "Zero-Knowledge Privacy",
    subtitle: "Verify Without Exposing",
    description: "Prove you're disciplined without revealing your P&L. Light Protocol compresses settlements into cryptographic proofs.",
    mechanism: "ZK proofs verify without revealing underlying data.",
    color: "violet",
    threat: "Strategy Theft",
    trigger: "100% privacy preserved",
  },
  {
    icon: Ghost,
    title: "Ghost Orders",
    subtitle: "Invisible Execution",
    description: "Pending orders hide on MagicBlock Ephemeral Rollups. Invisible to MEV bots until execution.",
    mechanism: "Orders exist in temporary state, revealed only at fill.",
    color: "cyan",
    threat: "Front-Running",
    trigger: "Zero MEV extraction",
  },
  {
    icon: BarChart3,
    title: "Behavioral Analysis",
    subtitle: "Pattern Recognition",
    description: "Neural networks scan 90 days of on-chain history. Detects revenge trading, FOMO, discipline gaps you can't see.",
    mechanism: "AI identifies behavioral patterns invisible to human perception.",
    color: "orange",
    threat: "Blind Spots",
    trigger: "6 core metrics analyzed",
  },
];

const colorMap = {
  orange: {
    text: "text-orange-400",
    bg: "bg-orange-500",
    border: "border-orange-500/30",
    bgLight: "bg-orange-500/10",
    glow: "shadow-orange-500/20",
    gradient: "from-orange-500/30 via-orange-500/5 to-transparent",
  },
  violet: {
    text: "text-violet-400",
    bg: "bg-violet-500",
    border: "border-violet-500/30",
    bgLight: "bg-violet-500/10",
    glow: "shadow-violet-500/20",
    gradient: "from-violet-500/30 via-violet-500/5 to-transparent",
  },
  cyan: {
    text: "text-cyan-400",
    bg: "bg-cyan-500",
    border: "border-cyan-500/30",
    bgLight: "bg-cyan-500/10",
    glow: "shadow-cyan-500/20",
    gradient: "from-cyan-500/30 via-cyan-500/5 to-transparent",
  },
};

function TypeWriter({ text, delay = 0, isActive }: { text: string; delay?: number; isActive: boolean }) {
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (!isActive) {
      setDisplayText("");
      return;
    }

    const timer = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        if (i <= text.length) {
          setDisplayText(text.slice(0, i));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 25);
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timer);
  }, [text, delay, isActive]);

  return (
    <span className="font-mono">
      {displayText}
      <span className="animate-pulse">{isActive && displayText.length < text.length ? "▋" : ""}</span>
    </span>
  );
}

export function FeaturesSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <section ref={containerRef} className="relative bg-[#0a0a0b]">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px"
        }}
      />

      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <NeuralNetworkBackground progress={smoothProgress} />
      </div>

      <div className="h-[70vh] flex items-center justify-center relative z-10">
        <div className="text-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-px bg-gradient-to-r from-transparent to-orange-500/60" />
              <span className="text-xs uppercase tracking-[0.3em] text-orange-400">Defense Layers</span>
              <div className="w-12 h-px bg-gradient-to-l from-transparent to-orange-500/60" />
            </div>

            <h2 className="text-4xl sm:text-5xl md:text-6xl text-white font-light tracking-tight mb-4">
              Four Barriers.
              <br />
              <span className="text-orange-400">One Purpose.</span>
            </h2>

            <p className="text-white/40 text-sm max-w-md mx-auto">
              Your brain evolved to survive, not to trade. Each layer corrects a cognitive vulnerability.
            </p>
          </motion.div>
        </div>
      </div>

      <ConnectionLine progress={smoothProgress} />

      <div className="relative">
        {features.map((feature, index) => (
          <FeatureLayer
            key={feature.title}
            feature={feature}
            index={index}
            totalFeatures={features.length}
            scrollYProgress={scrollYProgress}
          />
        ))}
      </div>

      <div className="h-[30vh]" />
    </section>
  );
}

function NeuralNetworkBackground({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const smoothMouseX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX / window.innerWidth);
      mouseY.set(e.clientY / window.innerHeight);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const foregroundNodes = [
    { x: 15, y: 25, size: 3, color: "orange", parallax: 15 },
    { x: 85, y: 35, size: 4, color: "violet", parallax: 15 },
    { x: 75, y: 65, size: 3, color: "cyan", parallax: 15 },
    { x: 25, y: 75, size: 4, color: "orange", parallax: 15 },
  ];

  const midgroundNodes = [
    { x: 50, y: 20, size: 2, color: "white", parallax: 8 },
    { x: 30, y: 50, size: 2, color: "white", parallax: 8 },
    { x: 70, y: 45, size: 2, color: "white", parallax: 8 },
    { x: 45, y: 80, size: 2, color: "white", parallax: 8 },
    { x: 60, y: 70, size: 2, color: "white", parallax: 8 },
  ];

  const backgroundNodes = [
    { x: 10, y: 15, size: 1.5, parallax: 3 },
    { x: 90, y: 25, size: 1.5, parallax: 3 },
    { x: 20, y: 90, size: 1.5, parallax: 3 },
    { x: 80, y: 85, size: 1.5, parallax: 3 },
    { x: 40, y: 10, size: 1, parallax: 3 },
    { x: 65, y: 90, size: 1, parallax: 3 },
  ];

  const colorValues: Record<string, string> = {
    orange: "#f97316",
    violet: "#8b5cf6",
    cyan: "#06b6d4",
    white: "rgba(255,255,255,0.3)",
  };

  const packets = [
    { from: 0, to: 1, speed: 3, delay: 0 },
    { from: 1, to: 2, speed: 4, delay: 0.5 },
    { from: 2, to: 3, speed: 3.5, delay: 1 },
    { from: 3, to: 0, speed: 4, delay: 1.5 },
    { from: 0, to: 2, speed: 5, delay: 0.8 },
  ];

  return (
    <svg className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <radialGradient id="nodeGlowOrange">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#f97316" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nodeGlowViolet">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nodeGlowCyan">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {backgroundNodes.map((node, i) => {
        const offsetX = useTransform(smoothMouseX, [0, 1], [-node.parallax, node.parallax]);
        const offsetY = useTransform(smoothMouseY, [0, 1], [-node.parallax, node.parallax]);

        return (
          <motion.g key={`bg-${i}`} style={{ x: offsetX, y: offsetY }}>
            <motion.circle
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r={node.size}
              fill="rgba(255,255,255,0.1)"
              initial={{ opacity: 0 }}
              style={{
                opacity: useTransform(progress, [0.1 + i * 0.05, 0.3], [0, 0.3]),
              }}
            />
          </motion.g>
        );
      })}

      {midgroundNodes.map((node, i) =>
        midgroundNodes.slice(i + 1).map((target, j) => {
          const avgParallax = (node.parallax + target.parallax) / 2;
          const offsetX = useTransform(smoothMouseX, [0, 1], [-avgParallax, avgParallax]);
          const offsetY = useTransform(smoothMouseY, [0, 1], [-avgParallax, avgParallax]);

          return (
            <motion.line
              key={`mg-conn-${i}-${j}`}
              x1={`${node.x}%`}
              y1={`${node.y}%`}
              x2={`${target.x}%`}
              y2={`${target.y}%`}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.5"
              initial={{ pathLength: 0, opacity: 0 }}
              style={{
                x: offsetX,
                y: offsetY,
                pathLength: useTransform(progress, [0.2, 0.5], [0, 1]),
                opacity: useTransform(progress, [0.2, 0.5, 0.8], [0, 0.3, 0.1]),
              }}
            />
          );
        })
      )}

      {foregroundNodes.map((node, i) =>
        foregroundNodes.slice(i + 1).map((target, j) => {
          const color = i % 2 === 0 ? "#f97316" : "#8b5cf6";
          const avgParallax = (node.parallax + target.parallax) / 2;
          const offsetX = useTransform(smoothMouseX, [0, 1], [-avgParallax, avgParallax]);
          const offsetY = useTransform(smoothMouseY, [0, 1], [-avgParallax, avgParallax]);

          return (
            <motion.line
              key={`fg-conn-${i}-${j}`}
              x1={`${node.x}%`}
              y1={`${node.y}%`}
              x2={`${target.x}%`}
              y2={`${target.y}%`}
              stroke={color}
              strokeWidth="1"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              style={{
                x: offsetX,
                y: offsetY,
                pathLength: useTransform(progress, [0.15, 0.4], [0, 1]),
                opacity: useTransform(progress, [0.15, 0.4, 0.9], [0, 0.4, 0.1]),
              }}
            />
          );
        })
      )}

      {midgroundNodes.map((node, i) => {
        const offsetX = useTransform(smoothMouseX, [0, 1], [-node.parallax, node.parallax]);
        const offsetY = useTransform(smoothMouseY, [0, 1], [-node.parallax, node.parallax]);

        return (
          <motion.circle
            key={`mg-${i}`}
            cx={`${node.x}%`}
            cy={`${node.y}%`}
            r={node.size}
            fill={colorValues[node.color as keyof typeof colorValues]}
            initial={{ opacity: 0, scale: 0 }}
            style={{
              x: offsetX,
              y: offsetY,
              opacity: useTransform(progress, [0.2 + i * 0.03, 0.35 + i * 0.03], [0, 0.4]),
              scale: useTransform(progress, [0.2 + i * 0.03, 0.35 + i * 0.03], [0, 1]),
            }}
          />
        );
      })}

      {foregroundNodes.map((node, i) => {
        const glowId = node.color === "orange" ? "url(#nodeGlowOrange)" :
                      node.color === "violet" ? "url(#nodeGlowViolet)" :
                      "url(#nodeGlowCyan)";
        const offsetX = useTransform(smoothMouseX, [0, 1], [-node.parallax, node.parallax]);
        const offsetY = useTransform(smoothMouseY, [0, 1], [-node.parallax, node.parallax]);

        return (
          <motion.g key={`fg-${i}`} style={{ x: offsetX, y: offsetY }}>
            <motion.circle
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r={node.size * 4}
              fill={glowId}
              initial={{ opacity: 0 }}
              style={{
                opacity: useTransform(progress, [0.1 + i * 0.05, 0.25 + i * 0.05], [0, 0.6]),
              }}
            />
            <motion.circle
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r={node.size}
              fill={colorValues[node.color]}
              initial={{ opacity: 0, scale: 0 }}
              style={{
                opacity: useTransform(progress, [0.1 + i * 0.05, 0.25 + i * 0.05], [0, 1]),
                scale: useTransform(progress, [0.1 + i * 0.05, 0.25 + i * 0.05], [0, 1]),
              }}
            />
          </motion.g>
        );
      })}

      {packets.map((packet, i) => {
        const from = foregroundNodes[packet.from];
        const to = foregroundNodes[packet.to];
        const avgParallax = (from.parallax + to.parallax) / 2;
        const offsetX = useTransform(smoothMouseX, [0, 1], [-avgParallax, avgParallax]);
        const offsetY = useTransform(smoothMouseY, [0, 1], [-avgParallax, avgParallax]);

        return (
          <motion.g key={`packet-${i}`} style={{ x: offsetX, y: offsetY }}>
            <motion.circle
              r="2"
              fill="#fff"
              initial={{ opacity: 0 }}
              style={{
                opacity: useTransform(progress, [0.3, 0.9], [0.8, 0]),
                cx: useTransform(
                  progress,
                  [0.3 + packet.delay * 0.1, 0.5 + packet.delay * 0.1],
                  [`${from.x}%`, `${to.x}%`]
                ),
                cy: useTransform(
                  progress,
                  [0.3 + packet.delay * 0.1, 0.5 + packet.delay * 0.1],
                  [`${from.y}%`, `${to.y}%`]
                ),
              }}
            />
          </motion.g>
        );
      })}
    </svg>
  );
}

function ConnectionLine({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const height = useTransform(progress, [0, 0.8], ["0%", "100%"]);

  return (
    <div className="fixed left-8 top-1/2 -translate-y-1/2 w-px h-[60vh] bg-white/5 hidden lg:block z-50">
      <motion.div
        className="w-full bg-gradient-to-b from-orange-500 via-violet-500 to-cyan-500"
        style={{ height }}
      />
      <motion.div
        className="absolute w-3 h-3 -left-[5px] rounded-full bg-orange-500 shadow-lg shadow-orange-500/50"
        style={{
          top: height,
          boxShadow: "0 0 20px currentColor",
        }}
      >
        <div className="absolute inset-0 rounded-full bg-orange-500 animate-ping" />
      </motion.div>
    </div>
  );
}

interface FeatureLayerProps {
  feature: typeof features[0];
  index: number;
  totalFeatures: number;
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}

function FeatureLayer({ feature, index, totalFeatures, scrollYProgress }: FeatureLayerProps) {
  const colors = colorMap[feature.color as keyof typeof colorMap];

  const startRange = 0.15 + (index * 0.15);
  const endRange = startRange + 0.15;
  const centerRange = startRange + 0.075;

  const opacity = useTransform(
    scrollYProgress,
    [startRange - 0.05, startRange, endRange - 0.05, endRange],
    [0, 1, 1, 0.3]
  );

  const scale = useTransform(
    scrollYProgress,
    [startRange - 0.05, startRange, endRange - 0.05, endRange],
    [0.9, 1, 1, 0.95]
  );

  const y = useTransform(
    scrollYProgress,
    [startRange - 0.05, startRange],
    [50, 0]
  );

  const isActive = useTransform(
    scrollYProgress,
    [startRange, centerRange, endRange],
    [false, true, false]
  );

  const [activeState, setActiveState] = useState(false);

  useEffect(() => {
    const unsubscribe = isActive.on("change", (v) => setActiveState(v));
    return () => unsubscribe();
  }, [isActive]);

  return (
    <div
      className="sticky top-[15vh] min-h-[70vh] flex items-center px-6 py-12"
      style={{ zIndex: index + 1 }}
    >
      <motion.div
        style={{ opacity, scale, y }}
        className="relative w-full max-w-5xl mx-auto"
      >
        <motion.div
          className="absolute -top-8 left-0 right-0 flex items-center justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: activeState ? 1 : 0.3 }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-red-400/60">
            Threat Detected
          </span>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-white/30">{feature.threat}</span>
        </motion.div>

        <div className="relative">
          <div className={`absolute inset-0 bg-gradient-radial ${colors.gradient} blur-3xl opacity-50`} />

          <div className="relative bg-[#0c0c0d] border border-white/[0.08] backdrop-blur-sm">
            <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 p-6 lg:p-10">
              <div className="lg:col-span-3 flex lg:flex-col items-center lg:items-start gap-4">
                <motion.span
                  className={`text-6xl lg:text-7xl font-light ${colors.text} opacity-20`}
                  animate={{ opacity: activeState ? 0.4 : 0.2 }}
                >
                  {String(index + 1).padStart(2, "0")}
                </motion.span>

                <motion.div
                  className={`relative w-16 h-16 ${colors.bgLight} border ${colors.border} flex items-center justify-center`}
                  animate={{
                    boxShadow: activeState
                      ? `0 0 30px currentColor`
                      : `0 0 0px currentColor`,
                  }}
                  transition={{ duration: 0.5 }}
                >
                  <feature.icon className={`w-8 h-8 ${colors.text}`} />
                  {activeState && (
                    <>
                      <div className={`absolute inset-0 ${colors.bg} opacity-20 animate-ping`} />
                      <div className="absolute -inset-2 border border-dashed border-white/10 animate-[spin_10s_linear_infinite]" />
                    </>
                  )}
                </motion.div>
              </div>

              <div className="lg:col-span-5 text-center lg:text-left">
                <span className={`text-xs uppercase tracking-[0.2em] ${colors.text} mb-2 block`}>
                  {feature.subtitle}
                </span>

                <h3 className="text-2xl lg:text-3xl text-white font-light mb-3">
                  {feature.title}
                </h3>

                <p className="text-white/50 text-sm leading-relaxed mb-4">
                  {feature.description}
                </p>

                <div className="p-3 bg-black/30 border border-white/5 font-mono text-xs">
                  <span className="text-white/30">$ </span>
                  <TypeWriter
                    text={feature.mechanism}
                    delay={0}
                    isActive={activeState}
                  />
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col items-center lg:items-end justify-center">
                <motion.div
                  className="text-center lg:text-right"
                  animate={{ scale: activeState ? 1.05 : 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className={`text-4xl lg:text-5xl font-light ${colors.text} mb-1`}>
                    {feature.trigger.split(" ")[0]}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {feature.trigger.split(" ").slice(1).join(" ")}
                  </div>
                </motion.div>

                <motion.div
                  className={`mt-4 px-3 py-1.5 ${colors.bgLight} border ${colors.border}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: activeState ? 1 : 0,
                    y: activeState ? 0 : 10,
                  }}
                  transition={{ delay: 0.5 }}
                >
                  <span className={`text-xs ${colors.text}`}>✓ Protection Active</span>
                </motion.div>
              </div>
            </div>

            <div className={`absolute top-0 left-0 w-3 h-3 border-l border-t ${colors.border}`} />
            <div className={`absolute top-0 right-0 w-3 h-3 border-r border-t ${colors.border}`} />
            <div className={`absolute bottom-0 left-0 w-3 h-3 border-l border-b ${colors.border}`} />
            <div className={`absolute bottom-0 right-0 w-3 h-3 border-r border-b ${colors.border}`} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

"use client";

import { HeroSection } from "./hero-section";
import { Footer } from "./footer";

export function LandingPage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0b] overflow-x-hidden">
      <HeroSection />
      <Footer />
    </main>
  );
}

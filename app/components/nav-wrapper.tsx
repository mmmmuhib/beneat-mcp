"use client";

import dynamic from "next/dynamic";

const Nav = dynamic(() => import("./nav").then((mod) => mod.Nav), {
  ssr: false,
});

export function NavWrapper() {
  return <Nav />;
}

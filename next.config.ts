import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    "ws",
    "@solana/react-hooks",
    "@solana/client",
    "@solana/kit",
  ],
  async redirects() {
    return [
      {
        source: "/scan",
        destination: "/leaderboard",
        permanent: true,
      },
      {
        source: "/scan/:wallet",
        destination: "/leaderboard/:wallet",
        permanent: true,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (base locale) embarque du WebAssembly : on le laisse hors du bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Les factures (PDF ou photos) dépassent la limite par défaut de 1 Mo.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;

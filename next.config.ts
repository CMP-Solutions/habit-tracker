import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only route indicator badge overlaps the nav's Abmelden button
  // at desktop widths; errors/warnings still surface without it.
  devIndicators: false,
};

export default nextConfig;

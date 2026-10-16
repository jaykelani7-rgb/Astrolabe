import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["ts-morph"],
  devIndicators: false,
};
export default config;

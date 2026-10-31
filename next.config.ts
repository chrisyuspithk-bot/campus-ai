import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

// Set by scripts/cf-deploy.sh. Swaps the Node-native modules for Workers-compatible ones.
const cloudflare = process.env.CAMPUS_TARGET === "cloudflare";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  poweredByHeader: false,
  // P5 scan upload: photos / PDFs of whole paper stacks pass through the proxy.
  experimental: { proxyClientMaxBodySize: "26mb" },
  serverExternalPackages: cloudflare ? [] : ["@napi-rs/canvas"],
  turbopack: {
    resolveAlias: cloudflare
      ? {
          "@/lib/db/driver": "./cf/db-driver.ts",
          "@napi-rs/canvas": "./cf/native-stub.ts",
          sharp: "./cf/native-stub.ts",
        }
      : {},
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

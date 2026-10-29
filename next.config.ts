import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  poweredByHeader: false,
  // P5 scan upload: photos / PDFs of whole paper stacks pass through the proxy.
  experimental: { proxyClientMaxBodySize: "26mb" },
  serverExternalPackages: ["@napi-rs/canvas"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

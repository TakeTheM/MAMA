import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        // Preserve native CSS Module processing; the Tailwind loader rewrites
        // the resource extension and would otherwise discard module exports.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // 브라우저의 /api/* 요청을 FastAPI로 넘긴다 (CORS 불필요, STACK.md C안)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

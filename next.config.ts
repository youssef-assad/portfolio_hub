import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/chat/[projectId]": ["./src/content/projects/**/*"],
  },
};

export default nextConfig;

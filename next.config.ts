import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate verification builds from a dev server or interrupted .next build.
  distDir: process.env.WTB_BUILD_DIR === ".next-validation" ? ".next-validation" : process.env.WTB_BUILD_DIR === ".next-preview" ? ".next-preview" : ".next",
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [{source:"/admin",headers:[
      {key:"Referrer-Policy",value:"no-referrer"},
      {key:"X-Frame-Options",value:"DENY"},
      {key:"Content-Security-Policy",value:"frame-ancestors 'none'; form-action 'self'; base-uri 'self'"},
      {key:"Cache-Control",value:"private, no-store"},
    ]}];
  },
};

export default nextConfig;

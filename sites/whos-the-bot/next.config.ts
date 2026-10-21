import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

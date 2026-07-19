import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    const immutable = [{
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    }];
    return [
      { source: "/scenes/:sceneId/v:version/:path*", headers: immutable },
      { source: "/scenes/shared/:hash/:path*", headers: immutable },
      { source: "/profiles/:profileId/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;

import { PHASE_PRODUCTION_BUILD } from "next/constants.js";
import { deploymentConfig } from "./deployment-config.mjs";
/** @type {import('next').NextConfig} */
const nextConfig = (phase) => {
  const { backend, production } = deploymentConfig(
    process.env,
    phase === PHASE_PRODUCTION_BUILD,
  );
  return {
    poweredByHeader: false,
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
    },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
            },
            { key: "X-Frame-Options", value: "DENY" },
            ...(production
              ? [
                  {
                    key: "Strict-Transport-Security",
                    value: "max-age=31536000",
                  },
                ]
              : []),
          ],
        },
      ];
    },
  };
};

export default nextConfig;

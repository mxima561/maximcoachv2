import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@maxima/shared"],
  productionBrowserSourceMaps: false,
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "maximcoach",
  project: "maximcoach-web",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload source maps in production only
  widenClientFileUpload: true,

  // Automatically annotate errors with component stack traces (Next.js 16 syntax)
  webpack: {
    reactComponentAnnotation: {
      enabled: true,
    },
  },
});

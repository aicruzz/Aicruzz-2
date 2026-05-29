// next.config.mjs

import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Production standalone build
  output: 'standalone',

  experimental: {
    // VERY IMPORTANT for monorepos
    outputFileTracingRoot: path.join(process.cwd(), '../../'),
  },

  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.aicruzz.com',
      },
    ],
  },

  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000',
  },
};

export default nextConfig;
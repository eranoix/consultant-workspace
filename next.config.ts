import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Docker image ships the standalone server only: no dev dependencies,
  // no source, a few dozen megabytes instead of the full node_modules.
  // Only in the image build, so `npm start` keeps working locally.
  output: process.env.STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;

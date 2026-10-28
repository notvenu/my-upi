import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Sheets push a history entry on mount and pop it on unmount; Strict Mode's double mount would add stray entries.
  reactStrictMode: false,
};

export default nextConfig;

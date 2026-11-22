/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Client-side only app, exported as static files into ./out (same as raft-chess-ui)
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;

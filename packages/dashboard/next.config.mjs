/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  // Exported as a static SPA and served by the Fastify backend.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  // In dev, proxy API + tracker to the backend so cookies stay same-origin.
  // (Rewrites are only applied by `next dev`; they are ignored by `next build`/export.)
  ...(isDev
    ? {
        async rewrites() {
          const target = process.env.RRKIT_API_ORIGIN ?? 'http://localhost:3000';
          return [
            { source: '/api/:path*', destination: `${target}/api/:path*` },
            { source: '/tracker.js', destination: `${target}/tracker.js` },
          ];
        },
      }
    : {}),
};

export default nextConfig;

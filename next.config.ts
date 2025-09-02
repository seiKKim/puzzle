// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // CJS 모듈 interop을 느슨하게 — __webpack_require__.n 이슈 완화
    esmExternals: 'loose',
  },
};

export default nextConfig;

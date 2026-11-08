import type { NextConfig } from "next";

// Заголовки безопасности без nonce — на всех ответах: страницы, редиректы, API, статика.
// CSP с nonce ставит src/proxy.ts (страницам), API — своя жёсткая CSP ниже, HSTS — Caddy в проде.
// Каждый ключ задаётся только здесь: дубль вроде «X-Frame-Options: DENY, DENY» браузер отбросит.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

// Ответам API (JSON, текст, поток SSE) ничего грузить и показывать не нужно. Proxy на /api не работает
// (matcher), так что эта CSP — единственная у них. Поток /api/events она не затрагивает: EventSource
// подчиняется connect-src страницы, а не CSP собственного ответа.
const API_CSP = [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: API_CSP },
    ];
  },
};

export default nextConfig;

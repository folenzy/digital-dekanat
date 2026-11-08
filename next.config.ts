import type { NextConfig } from "next";

// Заголовки безопасности без nonce — на всех ответах: страницы, редиректы, API, статика.
// CSP с nonce ставит src/proxy.ts (только страницам), HSTS — Caddy в проде.
// Каждый ключ задаётся только здесь: дубль вроде «X-Frame-Options: DENY, DENY» браузер отбросит.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

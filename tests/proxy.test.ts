import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/server/auth/cookie";

// Защитный слой запросов (src/proxy.ts): какие запросы он видит, CSP с nonce, увод анонима на /login.
// Сквозная проверка на прод-сборке — e2e/security-headers.spec.ts.

const ORIGIN = "http://127.0.0.1:3100";
const CSP = (nonce: string, extraScript = "") =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${extraScript}; ` +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const NONCE = /'nonce-([^']+)'/;

function request(path: string, init: { method?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers });
}
const withSession = (path: string) => request(path, { cookie: `${SESSION_COOKIE.name}=any-token` });

/** Куда ведёт редирект (путь с query) или null. NextURL пишет 127.0.0.1 как localhost — хост не сравниваем. */
function redirectTo(res: NextResponse): string | null {
  const location = getRedirectUrl(res);
  if (location === null) return null;
  const url = new URL(location);
  return url.pathname + url.search;
}
const matches = (path: string, headers?: Record<string, string>) =>
  unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}`, headers });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy: на какие запросы срабатывает (matcher)", () => {
  it("страницы — да, включая корень, вложенные и несуществующие адреса", () => {
    for (const path of [
      "/", "/login", "/about", "/schedule", "/staff", "/staff/appeals/x", "/takoy-stranitsy-net",
      "/apixyz", "/iconXsvg", "/faviconXico", // исключения — ровно эти пути, а не похожие
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("API, внутренности Next, иконка и favicon — нет", () => {
    for (const path of [
      "/api/events", "/api/events?probe=1", "/api/health", "/api/internal/demo-reset",
      "/_next/static/chunks/main.js", "/_next/static/media/golos.woff2", "/_next/image?url=%2Fa.png&w=64&q=75",
      "/icon.svg", "/icon.svg?abc123", "/favicon.ico",
      "/manifest.webmanifest", "/apple-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("предзагрузка next/link — нет (ей не нужен ни nonce, ни редирект)", () => {
    expect(matches("/schedule", { "next-router-prefetch": "1" })).toBe(false);
    expect(matches("/schedule", { purpose: "prefetch" })).toBe(false);
  });
});

describe("proxy: CSP с одноразовым nonce", () => {
  it("ответ несёт строгую CSP, а Next получает тот же nonce через заголовки запроса", () => {
    const res = proxy(withSession("/schedule"));
    expect(redirectTo(res)).toBeNull();
    const csp = res.headers.get("content-security-policy")!;
    const nonce = NONCE.exec(csp)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/); // 16 случайных байт в base64
    expect(csp).toBe(CSP(nonce!));
    // NextResponse.next({ request: { headers } }) передаёт заголовки запроса рендеру так:
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("nonce новый на каждый запрос", () => {
    const nonces = new Set(
      Array.from({ length: 20 }, () => NONCE.exec(proxy(withSession("/")).headers.get("content-security-policy")!)?.[1]),
    );
    expect(nonces.size).toBe(20);
  });

  it("'unsafe-eval' только в next dev (React восстанавливает стеки через eval), в сборке — нет", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(withSession("/")).headers.get("content-security-policy")).not.toContain("unsafe-eval");
    vi.stubEnv("NODE_ENV", "test");
    expect(proxy(withSession("/")).headers.get("content-security-policy")).not.toContain("unsafe-eval");

    vi.stubEnv("NODE_ENV", "development");
    const csp = proxy(withSession("/")).headers.get("content-security-policy")!;
    expect(csp).toBe(CSP(NONCE.exec(csp)![1], " 'unsafe-eval'"));
  });
});

describe("proxy: без cookie сессии — на вход", () => {
  it("страницы кабинетов и неизвестные адреса → 307 на /login", () => {
    for (const path of ["/", "/schedule", "/dekanat/new?type=x", "/staff", "/staff/profile", "/takoy-stranitsy-net"]) {
      const res = proxy(request(path));
      expect(res.status, path).toBe(307);
      expect(redirectTo(res), path).toBe("/login");
    }
  });

  it("/login и /about открыты анониму и получают CSP", () => {
    for (const path of ["/login", "/login?reason=expired", "/about"]) {
      const res = proxy(request(path));
      expect(redirectTo(res), path).toBeNull();
      expect(res.headers.get("content-security-policy"), path).toMatch(NONCE);
    }
  });

  it("не GET/HEAD (server action) не уводится: действие само вызывает requireStudent/requireStaff", () => {
    const res = proxy(request("/dekanat/new", { method: "POST" }));
    expect(redirectTo(res)).toBeNull();
    expect(proxy(request("/schedule", { method: "HEAD" })).status).toBe(307);
  });

  it("cookie есть — пропускает дальше: настоящую проверку сессии делает layout", () => {
    for (const path of ["/", "/schedule", "/staff"]) {
      expect(redirectTo(proxy(withSession(path))), path).toBeNull();
    }
  });

  it("смотрит на имя cookie из SESSION_COOKIE: за HTTPS это __Host-ns_session", () => {
    vi.stubEnv("COOKIE_SECURE", "true");
    expect(redirectTo(proxy(request("/", { cookie: "__Host-ns_session=t" })))).toBeNull();
    expect(redirectTo(proxy(request("/", { cookie: "ns_session=t" })))).toBe("/login");
    expect(redirectTo(proxy(request("/", { cookie: "other=t" })))).toBe("/login");
  });
});

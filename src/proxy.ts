import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/cookie";

// Защитный слой запросов страниц (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
// 01-app/03-api-reference/03-file-conventions/proxy.md).
// 1. Строгая CSP с одноразовым nonce. Next берёт nonce из заголовка Content-Security-Policy запроса и сам ставит
//    его на свои скрипты; 'strict-dynamic' пускает только их и то, что они подгрузят. Поэтому все страницы
//    рендерятся динамически (статическая страница осталась бы без nonce).
// 2. Без cookie сессии страницы уводят на /login. Это только удобство: права проверяют requireStudent/requireStaff
//    в каждом layout, странице и action. Proxy смотрит лишь, есть ли cookie.
// Заголовки без nonce (nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options) — в next.config.ts:
// они нужны на всех ответах, включая API и статику. HSTS ставит Caddy.

/** Страницы, открытые без входа. API сюда не входит: matcher его не пропускает, маршруты отвечают сами. */
const PUBLIC_PAGES = new Set(["/login", "/about"]);

function contentSecurityPolicy(nonce: string): string {
  // В next dev React восстанавливает серверные стеки через eval; в сборке eval не нужен и запрещён.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "style-src 'self' 'unsafe-inline'", // инлайновые style="" у полос оценок, скелетонов и т. п.
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'", // server actions, предзагрузка, поток /api/events
    "object-src 'none'", // никаких <object>/<embed>: плагины — старый обход script-src
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** 16 случайных байт в base64: угадать нельзя, на каждый запрос новый. */
function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Только чтение страниц: server action (POST) без cookie должен дойти до своего requireStudent/requireStaff —
  // тот ответит редиректом, который клиент Next понимает (на 307 браузер повторил бы POST на /login).
  const isPageRead = request.method === "GET" || request.method === "HEAD";
  if (isPageRead && !PUBLIC_PAGES.has(pathname) && !request.cookies.has(SESSION_COOKIE.name)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce);
  // Заголовки запроса видит только рендер (не клиент): из CSP Next достаёт nonce, x-nonce — для <Script nonce>.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Всё, кроме API, внутренностей Next (/_next/static, /_next/image, HMR в dev), иконок, favicon и манифеста:
      // их браузер и телефон просят без cookie, редирект на /login сломал бы установку на экран «Домой».
      source: "/((?!api/|_next/|favicon\\.ico|icon\\.svg|manifest\\.webmanifest|apple-icon\\.png|icon-[a-z0-9-]+\\.png).*)",
      // Предзагрузка next/link — это RSC-данные, а не документ: ей не нужны ни nonce, ни редирект.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

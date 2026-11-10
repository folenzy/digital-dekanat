// Параметры cookie сессии. Без зависимостей: модуль можно импортировать и из proxy.
// Имя cookie нигде больше не пишем руками — только SESSION_COOKIE.name.

const isSecure = () => process.env.COOKIE_SECURE === "true";

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  expires: Date;
};

export const SESSION_COOKIE = {
  /** Префикс __Host- браузер принимает только с Secure, Path=/ и без Domain, поэтому он только за HTTPS. */
  get name(): string {
    return isSecure() ? "__Host-ns_session" : "ns_session";
  },
  options(expires: Date): SessionCookieOptions {
    return { httpOnly: true, sameSite: "lax", path: "/", secure: isSecure(), expires };
  },
};

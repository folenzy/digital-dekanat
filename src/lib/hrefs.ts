// Ссылки на карточку обращения. Без server-only: нужны и серверному коду, и клиентским компонентам.
export const studentHref = (appealId: string) => `/dekanat/${appealId}`;
export const staffHref = (appealId: string) => `/staff/appeals/${appealId}`;

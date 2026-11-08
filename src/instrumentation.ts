// Next вызывает register() один раз при старте сервера и ждёт его, прежде чем принимать запросы
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// Здесь — миграции и демо-мир на пустой базе. Только рантайм Node: в edge нет ни fs, ни TCP к PostgreSQL.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootDatabase } = await import("./server/boot");
    await bootDatabase();
  }
}

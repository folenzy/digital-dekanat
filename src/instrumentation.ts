// Next вызывает register() один раз при старте сервера и ждёт его, прежде чем принимать запросы
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// Здесь — миграции и демо-мир на пустой базе. Только рантайм Node: в edge нет ни fs, ни TCP к PostgreSQL.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootDatabase } = await import("./server/boot");
    try {
      await bootDatabase();
    } catch (e) {
      // Ошибку register() Next только печатает, а процесс остаётся жить без подготовленной базы.
      // Завершаемся: Docker (restart: unless-stopped) перезапустит контейнер и попробует снова.
      console.error("Подготовка БД не удалась, процесс завершается:", (e as Error)?.message);
      process.exit(1);
    }
  }
}

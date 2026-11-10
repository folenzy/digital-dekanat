"use client";

import { ErrorState } from "@/ui/ErrorState";
import { PublicPage } from "@/ui/PublicPage";

// Сюда попадаем, если отправка формы не дошла до сервера (нет сети) или сервер упал.
export default function LoginError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <PublicPage>
      <ErrorState
        title="Не получилось связаться с сервером"
        text="Проверь интернет и попробуй войти ещё раз."
        retry={retry}
        retryLabel="Попробовать снова"
      />
    </PublicPage>
  );
}

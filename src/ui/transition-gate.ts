// Палец уже сам сдвинул лист: второй (браузерный) переход при листании не нужен. SwipePane поднимает флаг
// перед router.push, а PageTransition при создании нового листа видит его и не оборачивается в ViewTransition.
export const transitionGate = { silent: false };

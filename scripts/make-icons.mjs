// Одноразовая генерация PNG-иконок из src/app/icon.svg (sharp ставится вместе с next).
// Запуск: node scripts/make-icons.mjs. Результат коммитится, на сборке скрипт не нужен.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg", "utf8");
const BLUE = "#1E6FD9";

// Обычная иконка: SVG как есть (скруглённый квадрат).
const plain = (size, out) => sharp(Buffer.from(svg), { density: (72 * size) / 32 }).resize(size, size).png().toFile(out);

// iOS сама скругляет углы, поэтому apple-icon — сплошной синий квадрат со знаком без скругления.
const flat = svg.replace(/<rect [^>]*\/>/, `<rect width="32" height="32" fill="${BLUE}"/>`);
const square = (size, out) => sharp(Buffer.from(flat), { density: (72 * size) / 32 }).resize(size, size).png().toFile(out);

// Maskable: система режет до круга/«капли», знак держим в безопасной зоне ~80 % по центру на синем поле.
async function maskable(size, out) {
  const inner = Math.round(size * 0.8);
  const mark = await sharp(Buffer.from(flat), { density: (72 * inner) / 32 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BLUE } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(out);
}

await plain(192, "public/icon-192.png");
await plain(512, "public/icon-512.png");
await maskable(512, "public/icon-maskable-512.png");
await square(180, "src/app/apple-icon.png");
console.log("Иконки готовы.");

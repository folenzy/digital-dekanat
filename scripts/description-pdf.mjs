// docs/process/DESCRIPTION.md → docs/process/DESCRIPTION.pdf (A4) через Chromium из Playwright.
// Запуск: node scripts/description-pdf.mjs [--preview <папка>] — превью для проверки глазами
// Markdown разбирается здесь же: в документе только заголовки, абзацы, списки, таблицы, цитаты,
// **жирный**, *курсив*, `код` и ссылки — отдельная библиотека ради этого не нужна.
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "docs/process/DESCRIPTION.md");
const out = join(root, "docs/process/DESCRIPTION.pdf");
const fontCss = pathToFileURL(join(root, "node_modules/@fontsource-variable/golos-text/index.css")).href; // то же, что wght.css в layout.tsx

const REPO = "https://github.com/folenzy/digital-dekanat";
/** Относительная ссылка из DESCRIPTION.md → адрес файла на GitHub (ветка main). */
const toUrl = (href) =>
  /^https?:/.test(href) ? href : `${REPO}/blob/main/${new URL(href, "https://x/docs/process/").pathname.slice(1)}`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s);
  // ссылки на файлы репозитория ведут на GitHub; голые адреса https тоже кликабельны
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${toUrl(href)}">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(>])(https:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function toHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const html = [];
  let i = 0;
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4}) (.*)$/);
    if (h) { html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+$/.test(l.trim())) { html.push("<hr>"); i++; continue; }
    if (l.startsWith("|")) {
      const head = cells(l);
      i += 2; // строка заголовка и разделитель
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table>",
      );
      continue;
    }
    if (l.startsWith(">")) {
      const q = [];
      while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      html.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
      continue;
    }
    if (/^- /.test(l)) {
      const items = [];
      while (i < lines.length && /^(- |\s+\S)/.test(lines[i])) {
        if (/^- /.test(lines[i])) items.push(lines[i].slice(2));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      html.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||>|- |---)/.test(lines[i])) p.push(lines[i++]);
    html.push(`<p>${p.map(inline).join("<br>")}</p>`);
  }
  return html.join("\n");
}

const css = `
@import url("${fontCss}");
@page { size: A4; margin: 16mm 15mm 18mm; }
html { font-family: "Golos Text Variable", sans-serif; font-size: 9.6pt; line-height: 1.45; color: #14171c; }
body { margin: 0; }
h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 8pt; font-weight: 700; }
h2 { font-size: 13.5pt; margin: 16pt 0 6pt; padding-top: 6pt; border-top: 1px solid #d5d9e0; font-weight: 700; break-after: avoid; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
p { margin: 0 0 6pt; }
ul { margin: 0 0 6pt; padding-left: 14pt; }
li { margin: 0 0 2.5pt; }
hr { border: 0; border-top: 1px solid #d5d9e0; margin: 10pt 0; }
blockquote { margin: 0 0 6pt; padding: 4pt 10pt; border-left: 3px solid #1E6FD9; color: #333a45; }
a { color: #1E6FD9; text-decoration: none; }
strong { font-weight: 650; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.88em; background: #f0f2f5; padding: 0 2pt; border-radius: 2pt; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 8.8pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { text-align: left; vertical-align: top; padding: 3.5pt 5pt; border-bottom: 1px solid #e1e4e9; }
th { font-weight: 650; border-bottom: 1.5px solid #9aa3af; }
`;

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>«На связи» — описание работы</title>
<style>${css}</style></head><body>${toHtml(readFileSync(src, "utf8"))}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
// страница с file:// — иначе about:blank не подгрузит локальный шрифт
const dir = mkdtempSync(join(tmpdir(), "desc-pdf-"));
writeFileSync(join(dir, "index.html"), html);
await page.goto(pathToFileURL(join(dir, "index.html")).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
// fonts.check() вернёт true и без шрифта, если ни одно начертание не объявлено, — проверяем загруженные
await page.evaluate(() => document.fonts.load('400 12px "Golos Text Variable"', "Ж"));
const faces = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.status} ${f.unicodeRange}`));
const fontOk = faces.some((f) => f.startsWith("Golos") && f.includes(" loaded ") && f.includes("U+400-45F")); // кириллица
if (!fontOk) console.error(faces);
if (!fontOk) throw new Error("шрифт Golos Text не загрузился — PDF был бы запасным шрифтом");
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font-size:7pt;color:#7a828e;padding:0 15mm;display:flex;justify-content:space-between;font-family:sans-serif">' +
    '<span>«На связи» — цифровой деканат. Концепт для конкурса, данные вымышленные</span>' +
    '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
});
if (process.argv.includes("--preview")) {
  // проверка глазами без просмотрщика PDF: та же вёрстка в режиме печати, ширина A4 без полей, куски по высоте листа
  const dir = process.argv[process.argv.indexOf("--preview") + 1];
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 680, height: 960 });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0, n = 1; y < height; y += 960, n++) {
    await page.screenshot({ path: join(dir, `preview-${n}.png`), fullPage: true, clip: { x: 0, y, width: 680, height: Math.min(960, height - y) } });
  }
}
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log("PDF:", out);

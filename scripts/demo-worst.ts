import { loadEnvFile } from "node:process";

// «Худший случай» для проверки вёрстки: поверх обычного демо-мира записывает реалистичные неудобные данные —
// длинные двойные фамилии, имя без отчества, латиницу с диакритикой, длинные названия дисциплин и групп,
// неразрывную ссылку в обращении, сто уведомлений и две сотни обращений в очереди.
// Только для локальной разработки: `npm run demo:worst`. Вернуть обычный мир — `npm run demo:reset`.
// На сервер не попадает: скрипт отказывается работать с нелокальной базой.

try {
  loadEnvFile(".env");
} catch {
  // .env может отсутствовать: тогда берём значения из окружения
}

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function assertLocal(url: string | undefined): void {
  let host = "";
  try {
    host = new URL(url ?? "").hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!LOCAL.has(host) && !host.endsWith(".localhost")) {
    throw new Error("demo:worst разрешён только для локальной базы (localhost). Проверь DATABASE_URL.");
  }
}

const LONG_URL =
  "https://orientir-uni.example/students/documents/2026/autumn/certificates/military-registration/attachments/scan-0001-final-v2.pdf";

async function main() {
  assertLocal(process.env.DATABASE_URL);
  const { resetDemo } = await import("../src/server/demo/world");
  const { sql } = await import("../src/server/db/client");
  await resetDemo();

  // --- люди: длинная двойная фамилия, короткое имя без отчества, латиница с диакритикой ---
  await sql`update students set last_name = 'Константинопольская-Задунайская', first_name = 'Александра-Виктория',
              middle_name = 'Владиславовна'
            where id = (select s.id from students s join users u on u.id = s.user_id where u.login = 'alina.mironova')`;
  await sql`update students set last_name = 'Ю', first_name = 'Ли', middle_name = null
            where email = 'nikita.zakharov@orientir-uni.example'`;
  await sql`update students set last_name = 'Nguyễn', first_name = 'Thị Minh Khai', middle_name = null
            where email = 'milana.sokolova@orientir-uni.example'`;
  await sql`update staff set last_name = 'Римская-Корсакова-Преображенская', first_name = 'Анна-Мария'
            where id = (select st.id from staff st join users u on u.id = st.user_id where u.login = 'irina.belova')`;

  // --- справочники: длинные названия, которые в настоящем вузе встречаются ---
  await sql`update groups set name = 'МАГ-ПМИ-ИИ-25-1-вечерн.'
            where id = (select s.group_id from students s join users u on u.id = s.user_id where u.login = 'alina.mironova')`;
  await sql`update disciplines set name = 'Математическое моделирование социально-экономических процессов и систем в условиях неопределённости'
            where name = 'Дискретная математика'`;
  await sql`update disciplines set name = 'ОБЖ' where name = 'Базы данных'`;
  await sql`update teachers set full_name = 'Константинопольский-Задунайский Александр-Христофор Владиславович'
            where id = (select id from teachers order by id limit 1)`;
  await sql`update rooms set name = 'А-310 (лаборатория вычислительных систем)' where name = 'А-310'`;
  await sql`update departments set name = 'Отдел по работе со студентами очной и очно-заочной форм обучения' where code = 'study'`;
  await sql`update deadlines set title = 'Подача заявлений на материальную помощь, социальную стипендию и компенсацию проезда для иногородних студентов первого и второго курсов'
            where id = (select id from deadlines order by ends_at limit 1)`;

  // --- обращение: текст на пределе формы (2000 знаков) с неразрывной ссылкой ---
  const longText = `Прошу выдать справку. Скан повестки лежит здесь: ${LONG_URL} — ${"очень нужно до пятницы, потому что военкомат принимает только по вторникам и четвергам. ".repeat(18)}`.slice(0, 2000);
  await sql`update appeals set fields = jsonb_set(fields, '{destination}', to_jsonb(${`Военный_комиссариат_Центрального_и_Железнодорожного_районов_города_${"Н".repeat(40)}`}::text))
            where student_id = (select s.id from students s join users u on u.id = s.user_id where u.login = 'alina.mironova')`;
  await sql`insert into appeal_messages (appeal_id, author_user_id, body)
            select a.id, u.id, ${longText} from appeals a
              join students s on s.id = a.student_id join users u on u.id = s.user_id
             where u.login = 'alina.mironova' limit 1`;

  // --- объявление на пределе формы: заголовок 120, текст 3000 ---
  await sql`update announcements set
              title = ${"Изменение порядка проведения промежуточной аттестации и графика ликвидации академических задолженностей в зимнюю сессию".slice(0, 120)},
              body = ${"Внимательно прочитай новый порядок. ".repeat(84).slice(0, 3000)}
            where id = (select id from announcements order by published_at desc limit 1)`;

  // --- количества: 128 непрочитанных уведомлений (счётчик «99+»), 200 новых обращений в очереди без пагинации ---
  await sql`insert into notifications (user_id, kind, title, body, href, created_at)
            select u.id, 'deadline', 'Напоминание № ' || g, 'До срока осталось ' || g || ' ч.', '/', now() - (g || ' minutes')::interval
              from users u, generate_series(1, 125) g where u.login = 'alina.mironova'`;
  await sql`insert into appeals (student_id, type_code, department_id, status, fields, sla_due_at, created_at, updated_at)
            select a.student_id, a.type_code, a.department_id, 'submitted', a.fields,
                   now() + ((g % 96) - 20 || ' hours')::interval, now() - (g || ' minutes')::interval, now()
              from (select * from appeals where status = 'submitted' limit 1) a, generate_series(1, 200) g`;

  console.log("Худший случай записан в локальную базу. Вернуть обычный мир: npm run demo:reset");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

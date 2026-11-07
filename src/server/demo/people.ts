// Справочные данные вымышленного вуза «Университет Ориентир».
// Все имена, номера и адреса выдуманы; совпадения случайны.

export const FACULTIES = [
  { code: "ФПМИ", name: "Факультет прикладной математики и информатики" },
  { code: "ФЭУ", name: "Факультет экономики и управления" },
  { code: "ГФ", name: "Гуманитарный факультет" },
] as const;

export const PROGRAMS = [
  { key: "pmi", faculty: "ФПМИ", code: "01.03.02", name: "Прикладная математика и информатика", profile: "Анализ данных и моделирование" },
  { key: "eco", faculty: "ФЭУ", code: "38.03.01", name: "Экономика", profile: "Экономика предприятий и финансы" },
  { key: "ling", faculty: "ГФ", code: "45.03.02", name: "Лингвистика", profile: "Перевод и переводоведение" },
] as const;

export const GROUPS = [
  { name: "ПМИ-24-1", program: "pmi", course: 2 },
  { name: "ПМИ-24-2", program: "pmi", course: 2 },
  { name: "ЭК-23-1", program: "eco", course: 3 },
  { name: "ЭК-23-2", program: "eco", course: 3 },
  { name: "ЛИН-25-1", program: "ling", course: 1 },
] as const;

export const DEPARTMENTS = [
  { code: "docs", name: "Справки и документы" },
  { code: "study", name: "Учебный отдел" },
  { code: "stipend", name: "Стипендиальный отдел" },
] as const;

export const ROOMS = [
  { name: "А-203", building: "Корпус А" },
  { name: "А-205", building: "Корпус А" },
  { name: "А-215", building: "Корпус А" },
  { name: "А-217", building: "Корпус А" },
  { name: "А-218", building: "Корпус А" },
  { name: "А-301", building: "Корпус А" },
  { name: "А-305", building: "Корпус А" },
  { name: "А-310", building: "Корпус А" },
  { name: "Б-12", building: "Корпус Б" },
  { name: "Б-14", building: "Корпус Б" },
  { name: "Б-104", building: "Корпус Б" },
  { name: "Б-106", building: "Корпус Б" },
  { name: "Б-201", building: "Корпус Б" },
] as const;

export const TEACHERS = [
  "Ковалёва Марина Анатольевна",
  "Лебедев Сергей Павлович",
  "Орлов Андрей Витальевич",
  "Фомина Татьяна Львовна",
  "Зайцев Павел Игоревич",
  "Назарова Ольга Борисовна",
  "Морозов Виктор Степанович",
  "Крылова Наталья Юрьевна",
  "Данилов Игорь Аркадьевич",
  "Власова Екатерина Романовна",
  "Широков Евгений Леонидович",
  "Беляева Анна Денисовна",
  "Тимофеев Роман Александрович", // замены
] as const;

// Дисциплины всех семестров, которые встречаются в демо-мире.
export const DISCIPLINES = [
  "Математический анализ", "Дискретная математика", "Объектно-ориентированное программирование",
  "Теория вероятностей", "Базы данных", "Английский язык", "Линейная алгебра",
  "Алгоритмы и структуры данных", "Физика",
  "Макроэкономика", "Эконометрика", "Финансовый менеджмент", "Бухгалтерский учёт",
  "Корпоративное право", "Профессиональный иностранный язык",
  "Микроэкономика", "Статистика", "Деньги, кредит, банки", "Гражданское право",
] as const;

type Lesson = "lecture" | "practice" | "lab";
type Parity = "odd" | "even" | "both";

export type SlotDef = {
  group: string; weekday: number; parity: Parity; pair: number;
  discipline: string; type: Lesson; room: string; teacher: string;
};

const slot = (
  group: string, weekday: number, pair: number, discipline: string, type: Lesson,
  room: string, teacher: string, parity: Parity = "both",
): SlotDef => ({ group, weekday, parity, pair, discipline, type, room, teacher });

const PMI = "ПМИ-24-1";
const EK = "ЭК-23-2";
const [KOV, LEB, ORL, FOM, ZAI, NAZ] = TEACHERS;
const [MOR, KRY, DAN, VLA, SHI, BEL] = [TEACHERS[6], TEACHERS[7], TEACHERS[8], TEACHERS[9], TEACHERS[10], TEACHERS[11]];

// Недельный шаблон: в каждый будний день не меньше двух пар при любой чётности.
export const SCHEDULE: SlotDef[] = [
  // ПМИ-24-1
  slot(PMI, 1, 2, "Математический анализ", "lecture", "А-301", KOV),
  slot(PMI, 1, 3, "Математический анализ", "practice", "А-215", KOV),
  slot(PMI, 1, 4, "Английский язык", "practice", "Б-104", NAZ),
  slot(PMI, 2, 1, "Дискретная математика", "lecture", "А-301", LEB),
  slot(PMI, 2, 2, "Дискретная математика", "practice", "А-215", LEB, "odd"),
  slot(PMI, 2, 3, "Объектно-ориентированное программирование", "lab", "Б-12", ORL),
  slot(PMI, 3, 2, "Теория вероятностей", "lecture", "А-301", FOM),
  slot(PMI, 3, 3, "Объектно-ориентированное программирование", "lecture", "А-205", ORL),
  slot(PMI, 3, 4, "Базы данных", "lab", "Б-12", ZAI),
  slot(PMI, 4, 1, "Английский язык", "practice", "Б-104", NAZ, "even"),
  slot(PMI, 4, 2, "Математический анализ", "practice", "А-215", KOV),
  slot(PMI, 4, 3, "Базы данных", "lecture", "А-205", ZAI),
  slot(PMI, 5, 2, "Дискретная математика", "practice", "А-215", LEB),
  slot(PMI, 5, 3, "Теория вероятностей", "practice", "А-217", FOM),
  // ЭК-23-2
  slot(EK, 1, 1, "Макроэкономика", "lecture", "А-305", KRY),
  slot(EK, 1, 2, "Макроэкономика", "practice", "А-218", KRY),
  slot(EK, 1, 3, "Профессиональный иностранный язык", "practice", "Б-106", BEL),
  slot(EK, 2, 2, "Эконометрика", "lecture", "А-305", MOR),
  slot(EK, 2, 3, "Эконометрика", "lab", "Б-14", MOR),
  slot(EK, 2, 4, "Корпоративное право", "lecture", "А-203", SHI, "odd"),
  slot(EK, 3, 2, "Финансовый менеджмент", "lecture", "А-203", DAN),
  slot(EK, 3, 3, "Бухгалтерский учёт", "lecture", "А-203", VLA),
  slot(EK, 3, 4, "Профессиональный иностранный язык", "practice", "Б-106", BEL, "even"),
  slot(EK, 4, 1, "Бухгалтерский учёт", "practice", "А-218", VLA),
  slot(EK, 4, 2, "Финансовый менеджмент", "practice", "А-218", DAN),
  slot(EK, 4, 3, "Корпоративное право", "practice", "А-203", SHI),
  slot(EK, 5, 2, "Эконометрика", "lab", "Б-14", MOR),
  slot(EK, 5, 3, "Макроэкономика", "practice", "А-218", KRY),
];

// Аудитории и преподаватель для изменений расписания
export const CHANGE_ROOMS = ["А-310", "Б-201"] as const;
export const SUBSTITUTE_TEACHER = TEACHERS[12];

export type ExamDef = {
  group: string; discipline: string; kind: "exam" | "credit"; date: string; time: string; room: string;
};

// Сессия: фиксированные даты, начиная с 22 декабря 2026
export const SESSION_EXAMS: ExamDef[] = [
  { group: PMI, discipline: "Математический анализ", kind: "exam", date: "2026-12-22", time: "10:00", room: "А-301" },
  { group: PMI, discipline: "Дискретная математика", kind: "credit", date: "2026-12-23", time: "10:00", room: "А-215" },
  { group: PMI, discipline: "Объектно-ориентированное программирование", kind: "credit", date: "2026-12-24", time: "10:00", room: "Б-12" },
  { group: PMI, discipline: "Теория вероятностей", kind: "exam", date: "2026-12-25", time: "10:00", room: "А-301" },
  { group: PMI, discipline: "Базы данных", kind: "credit", date: "2026-12-28", time: "10:00", room: "Б-12" },
  { group: PMI, discipline: "Английский язык", kind: "credit", date: "2026-12-29", time: "10:00", room: "Б-104" },
  { group: EK, discipline: "Профессиональный иностранный язык", kind: "credit", date: "2026-12-22", time: "10:00", room: "Б-106" },
  { group: EK, discipline: "Эконометрика", kind: "exam", date: "2026-12-23", time: "10:00", room: "А-305" },
  { group: EK, discipline: "Финансовый менеджмент", kind: "credit", date: "2026-12-24", time: "10:00", room: "А-203" },
  { group: EK, discipline: "Корпоративное право", kind: "credit", date: "2026-12-25", time: "10:00", room: "А-203" },
  { group: EK, discipline: "Макроэкономика", kind: "exam", date: "2026-12-28", time: "10:00", room: "А-305" },
  { group: EK, discipline: "Бухгалтерский учёт", kind: "exam", date: "2026-12-30", time: "10:00", room: "А-203" },
];

export const STAFF_MEMBER = {
  login: "irina.belova",
  lastName: "Белова", firstName: "Ирина", middleName: "Николаевна",
  position: "Специалист единого деканата",
} as const;

export const STUDENTS = {
  alina: {
    login: "alina.mironova" as string | null,
    lastName: "Миронова", firstName: "Алина", middleName: "Сергеевна",
    group: "ПМИ-24-1", studyForm: "очная", funding: "бюджет",
    recordBookNo: "ОР-24-0137", email: "alina.mironova@orientir-uni.example",
    curatorName: "Ковалёва Марина Анатольевна",
  },
  denis: {
    login: "denis.kravtsov" as string | null,
    lastName: "Кравцов", firstName: "Денис", middleName: "Олегович",
    group: "ЭК-23-2", studyForm: "очная", funding: "договор",
    recordBookNo: "ОР-23-0412", email: "denis.kravtsov@orientir-uni.example",
    curatorName: "Данилов Игорь Аркадьевич",
  },
  // вымышленные студенты без логина: войти нельзя, нужны для очереди сотрудника
  tikhonov: {
    login: null as string | null,
    lastName: "Тихонов", firstName: "Артём", middleName: "Игоревич",
    group: "ПМИ-24-2", studyForm: "очная", funding: "бюджет",
    recordBookNo: "ОР-24-0151", email: "artem.tikhonov@orientir-uni.example",
    curatorName: "Ковалёва Марина Анатольевна",
  },
  sokolova: {
    login: null as string | null,
    lastName: "Соколова", firstName: "Милана", middleName: "Андреевна",
    group: "ЭК-23-1", studyForm: "очная", funding: "бюджет",
    recordBookNo: "ОР-23-0388", email: "milana.sokolova@orientir-uni.example",
    curatorName: "Власова Екатерина Романовна",
  },
} as const;

export type CheckpointDef = {
  title: string; max: number; score: number | null; dueOffset: number; required?: boolean;
};
export type EnrollmentDef = {
  discipline: string; semester: number; form: "exam" | "credit" | "graded_credit";
  grade?: string; admitted?: boolean | null; checkpoints?: CheckpointDef[];
};

// dueOffset — дни от «сегодня»; баллы текущего семестра = сумма набранных точек.
export const ALINA_ENROLLMENTS: EnrollmentDef[] = [
  // прошлая сессия (семестр 2): всё на отлично
  { discipline: "Математический анализ", semester: 2, form: "exam", grade: "5" },
  { discipline: "Линейная алгебра", semester: 2, form: "exam", grade: "5" },
  { discipline: "Алгоритмы и структуры данных", semester: 2, form: "exam", grade: "5" },
  { discipline: "Физика", semester: 2, form: "exam", grade: "4" },
  { discipline: "Английский язык", semester: 2, form: "graded_credit", grade: "5" },
  // текущий семестр (3)
  { discipline: "Математический анализ", semester: 3, form: "exam", admitted: true, checkpoints: [
    { title: "Контрольная работа №1", max: 20, score: 18, dueOffset: -35, required: true },
    { title: "Коллоквиум", max: 20, score: 17, dueOffset: -9, required: true },
    { title: "Контрольная работа №2", max: 20, score: null, dueOffset: 16 },
  ] },
  { discipline: "Дискретная математика", semester: 3, form: "credit", admitted: true, checkpoints: [
    { title: "Типовой расчёт", max: 25, score: 23, dueOffset: -20, required: true },
    { title: "Контрольная работа", max: 25, score: 21, dueOffset: -4, required: true },
    { title: "Итоговая контрольная", max: 20, score: null, dueOffset: 18 },
  ] },
  { discipline: "Объектно-ориентированное программирование", semester: 3, form: "graded_credit", admitted: true, checkpoints: [
    { title: "Лабораторные работы №1–2", max: 20, score: 20, dueOffset: -28, required: true },
    { title: "Лабораторная работа №3", max: 20, score: 18, dueOffset: -6, required: true },
    { title: "Мини-проект", max: 30, score: null, dueOffset: 20 },
  ] },
  { discipline: "Теория вероятностей", semester: 3, form: "exam", admitted: true, checkpoints: [
    { title: "Контрольная работа №1", max: 20, score: 16, dueOffset: -30, required: true },
    { title: "Домашнее задание", max: 10, score: 10, dueOffset: -14 },
    { title: "Контрольная работа №2", max: 20, score: null, dueOffset: 15 },
  ] },
  { discipline: "Базы данных", semester: 3, form: "graded_credit", admitted: true, checkpoints: [
    { title: "Проект: схема базы данных", max: 20, score: 19, dueOffset: -18, required: true },
    { title: "SQL-практикум", max: 20, score: 17, dueOffset: -5 },
    { title: "Защита проекта", max: 30, score: null, dueOffset: 19 },
  ] },
  { discipline: "Английский язык", semester: 3, form: "credit", admitted: true, checkpoints: [
    { title: "Тест №1", max: 20, score: 19, dueOffset: -26 },
    { title: "Эссе", max: 20, score: 17, dueOffset: -10 },
    { title: "Итоговый тест", max: 20, score: null, dueOffset: 17 },
  ] },
];

export const DENIS_ENROLLMENTS: EnrollmentDef[] = [
  // прошлая сессия (семестр 4): неуд по статистике
  { discipline: "Микроэкономика", semester: 4, form: "exam", grade: "4" },
  { discipline: "Статистика", semester: 4, form: "exam", grade: "2" },
  { discipline: "Деньги, кредит, банки", semester: 4, form: "exam", grade: "3" },
  { discipline: "Гражданское право", semester: 4, form: "graded_credit", grade: "4" },
  { discipline: "Профессиональный иностранный язык", semester: 4, form: "credit", grade: "зачёт" },
  // текущий семестр (5)
  { discipline: "Эконометрика", semester: 5, form: "exam", admitted: null, checkpoints: [
    { title: "Лабораторная работа №1", max: 15, score: 14, dueOffset: -30, required: true },
    { title: "Лабораторная работа №2", max: 15, score: 12, dueOffset: -14, required: true },
    { title: "Лабораторная работа №3 (регрессионная модель)", max: 15, score: null, dueOffset: 3, required: true },
  ] },
  { discipline: "Макроэкономика", semester: 5, form: "exam", admitted: true, checkpoints: [
    { title: "Контрольная работа", max: 25, score: 19, dueOffset: -12, required: true },
    { title: "Доклад", max: 15, score: 12, dueOffset: -20 },
    { title: "Тест по модели IS-LM", max: 20, score: null, dueOffset: 14 },
  ] },
  { discipline: "Финансовый менеджмент", semester: 5, form: "graded_credit", admitted: true, checkpoints: [
    { title: "Кейс №1", max: 20, score: 15, dueOffset: -22, required: true },
    { title: "Контрольная работа", max: 20, score: 11, dueOffset: -7 },
    { title: "Итоговый кейс", max: 30, score: null, dueOffset: 17 },
  ] },
  { discipline: "Бухгалтерский учёт", semester: 5, form: "exam", admitted: true, checkpoints: [
    { title: "Контрольная работа №1", max: 20, score: 13, dueOffset: -25, required: true },
    { title: "Практическое задание", max: 20, score: 14, dueOffset: -9 },
    { title: "Контрольная работа №2", max: 20, score: null, dueOffset: 13 },
  ] },
  { discipline: "Корпоративное право", semester: 5, form: "credit", admitted: true, checkpoints: [
    { title: "Тест №1", max: 20, score: 14, dueOffset: -21 },
    { title: "Реферат", max: 20, score: 16, dueOffset: -8 },
  ] },
  { discipline: "Профессиональный иностранный язык", semester: 5, form: "credit", admitted: true, checkpoints: [
    { title: "Тест №1", max: 20, score: 12, dueOffset: -24 },
    { title: "Устный опрос", max: 20, score: 13, dueOffset: -8 },
  ] },
];

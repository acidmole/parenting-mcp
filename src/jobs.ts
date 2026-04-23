import { getWilmaSchedule, getWilmaHomework, getWilmaExams } from "./services/wilma.js";
import { sendMessage } from "./services/whatsapp.js";
import { loadConfig, type AppConfig } from "./services/config.js";

interface StudentSchedule {
  student: { name: string };
  items: Array<{ start: string; end: string; subject: string; subjectCode: string }>;
}

interface StudentHomework {
  student: { name: string };
  items: Array<{ date: string; subject: string; homework: string }>;
}

interface StudentExams {
  student: { name: string };
  items: Array<{ date: string; subject: string; name: string; topic: string | null }>;
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatFi(d: Date): string {
  return d.toLocaleDateString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

export type ScheduleTarget = "today" | "tomorrow";

interface ResolvedTarget {
  iso: string;           // YYYY-MM-DD, used to filter exams
  label: string;         // "Huomenna ke 15.4." or "Tänään pe 17.4."
  noSchoolLabel: string; // "Huomenna ke 15.4. ei koulua! 🎉"
  wilmaWhen: string;     // value for wilma CLI --when
}

function resolveTarget(target: ScheduleTarget): ResolvedTarget {
  const now = new Date();
  if (target === "today") {
    const d = now;
    const fi = formatFi(d);
    return {
      iso: toISO(d),
      label: `Tänään ${fi} koulut:`,
      noSchoolLabel: `Tänään ${fi} ei koulua! 🎉`,
      wilmaWhen: "today",
    };
  }
  const d = addDays(now, 1);
  const fi = formatFi(d);
  return {
    iso: toISO(d),
    label: `Huomenna ${fi} koulut:`,
    noSchoolLabel: `Huomenna ${fi} ei koulua! 🎉`,
    wilmaWhen: "tomorrow",
  };
}

function isOnlineCourse(
  config: AppConfig,
  studentName: string,
  item: { start: string; subjectCode: string }
): boolean {
  const name = firstName(studentName);
  for (const filter of config.filters.onlineCourses) {
    if (filter.studentFirstName === name &&
        item.start === filter.startTime &&
        filter.subjectCodePatterns.some((p) => item.subjectCode.includes(p))) {
      return true;
    }
  }
  return false;
}

function getSchoolTimes(config: AppConfig, student: StudentSchedule): { start: string; end: string } | null {
  let items = student.items;
  items = items.filter((i) => !isOnlineCourse(config, student.student.name, i));
  if (items.length === 0) return null;
  const starts = items.map((i) => i.start).sort();
  const ends = items.map((i) => i.end).sort();
  return { start: starts[0], end: ends[ends.length - 1] };
}

// --- Homework summary (16:00) ---

export async function sendHomeworkSummary(config: AppConfig): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running homework summary...`);

  const TARGET_JID = config.whatsapp.targetJid;
  const IS_GROUP = config.whatsapp.isGroup;

  const homeworkData = (await getWilmaHomework(20)) as { students: StudentHomework[] };

  const today = new Date().toISOString().split("T")[0];
  const lines: string[] = [];

  lines.push("Tämän päivän läksyt Wilmassa:");
  lines.push("");

  const studentsWithHomework: string[] = [];
  const studentsWithoutHomework: string[] = [];

  for (const student of homeworkData.students) {
    const name = firstName(student.student.name);
    const todayHW = student.items.filter((hw) => hw.date === today);

    if (todayHW.length > 0) {
      studentsWithHomework.push(name);
      lines.push(`${name}:`);
      for (const hw of todayHW) {
        lines.push(`- ${hw.subject}: ${hw.homework.split("\n")[0]}`);
      }
      lines.push("");
    } else {
      studentsWithoutHomework.push(name);
    }
  }

  if (studentsWithoutHomework.length > 0) {
    lines.push(`${studentsWithoutHomework.join(", ")}: Ei läksyjä Wilmassa`);
  }

  if (studentsWithHomework.length === 0) {
    await sendMessage(TARGET_JID, "Ei läksyjä Wilmassa tänään! 🎉", IS_GROUP);
    return;
  }

  await sendMessage(TARGET_JID, lines.join("\n"), IS_GROUP);
  console.log("Homework summary sent.");
}

// --- Evening schedule + special events (20:00) ---

export async function sendEveningSchedule(
  config: AppConfig,
  target: ScheduleTarget = "tomorrow"
): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running evening schedule (target=${target})...`);

  const TARGET_JID = config.whatsapp.targetJid;
  const IS_GROUP = config.whatsapp.isGroup;
  const t = resolveTarget(target);

  // Run sequentially — both use runWilmaAllProfiles which writes to the shared
  // Wilma config file to switch profiles. Running in parallel causes a race
  // condition where one call overwrites the profile before the other's CLI reads it.
  const scheduleData = await getWilmaSchedule({ when: t.wilmaWhen }) as { students: StudentSchedule[] };
  const examsData = await getWilmaExams(20) as { students: StudentExams[] };

  const lines: string[] = [];

  const entries: Array<{ name: string; start: string; end: string }> = [];
  for (const student of scheduleData.students) {
    const times = getSchoolTimes(config, student);
    if (times) {
      entries.push({ name: firstName(student.student.name), ...times });
    }
  }

  if (entries.length === 0) {
    await sendMessage(TARGET_JID, t.noSchoolLabel, IS_GROUP);
    return;
  }

  entries.sort((a, b) => a.start.localeCompare(b.start));
  lines.push(t.label);
  lines.push("");
  for (const e of entries) {
    lines.push(`${e.name} ${e.start}–${e.end}`);
  }

  const specials: string[] = [];
  for (const student of examsData.students) {
    const name = firstName(student.student.name);
    const targetExams = student.items.filter((e) => e.date === t.iso);
    for (const exam of targetExams) {
      specials.push(`- ${name}: ${exam.subject}${exam.name ? ` — ${exam.name}` : ""}`);
    }
  }

  if (specials.length > 0) {
    lines.push("");
    lines.push("Erikoisohjelma:");
    for (const s of specials) {
      lines.push(s);
    }
  }

  await sendMessage(TARGET_JID, lines.join("\n"), IS_GROUP);
  console.log("Evening schedule sent.");
}

// --- Sunday weekly overview (next week's exams) ---

export async function sendWeeklyOverview(config: AppConfig): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running weekly overview...`);

  const TARGET_JID = config.whatsapp.targetJid;
  const IS_GROUP = config.whatsapp.isGroup;

  const examsData = (await getWilmaExams(50)) as { students: StudentExams[] };

  const today = new Date();
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + 1); // tomorrow is Monday
  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);

  const mondayStr = nextMonday.toISOString().split("T")[0];
  const fridayStr = nextFriday.toISOString().split("T")[0];

  const examsByDate = new Map<string, string[]>();

  for (const student of examsData.students) {
    const name = firstName(student.student.name);
    for (const exam of student.items) {
      if (exam.date >= mondayStr && exam.date <= fridayStr) {
        const dateKey = exam.date;
        if (!examsByDate.has(dateKey)) {
          examsByDate.set(dateKey, []);
        }
        const desc = exam.name
          ? `${name}: ${exam.subject} — ${exam.name}`
          : `${name}: ${exam.subject}`;
        examsByDate.get(dateKey)!.push(desc);
      }
    }
  }

  if (examsByDate.size === 0) {
    await sendMessage(TARGET_JID, "Ensi viikolla ei kokeita eikä erikoisohjelmaa! 🎉", IS_GROUP);
    return;
  }

  const lines: string[] = ["Ensi viikon kokeet:"];
  lines.push("");

  const sortedDates = [...examsByDate.keys()].sort();
  for (const date of sortedDates) {
    const d = new Date(date + "T12:00:00");
    const dayStr = d.toLocaleDateString("fi-FI", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
    });
    lines.push(dayStr);
    for (const exam of examsByDate.get(date)!) {
      lines.push(`- ${exam}`);
    }
    lines.push("");
  }

  await sendMessage(TARGET_JID, lines.join("\n"), IS_GROUP);
  console.log("Weekly overview sent.");
}

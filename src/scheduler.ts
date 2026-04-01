import cron from "node-cron";
import { getWilmaSchedule, getWilmaHomework, getWilmaExams } from "./services/wilma.js";
import { sendMessage, disconnect } from "./services/whatsapp.js";
import { loadConfig, isConfigured, type AppConfig } from "./services/config.js";

const config = await loadConfig();

if (!isConfigured(config)) {
  console.error("WhatsApp-kohdetta ei ole määritetty. Aja ensin: npm run setup");
  process.exit(1);
}

const TARGET_JID = config.whatsapp.targetJid;
const IS_GROUP = config.whatsapp.isGroup;

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

interface StudentNews {
  student: { name: string };
  items: Array<{ title: string; subtitle: string | null; published: string }>;
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function isOnlineCourse(studentName: string, item: { start: string; subjectCode: string }): boolean {
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

function getSchoolTimes(student: StudentSchedule): { start: string; end: string } | null {
  let items = student.items;

  // Filter out online courses based on config
  items = items.filter((i) => !isOnlineCourse(student.student.name, i));

  if (items.length === 0) return null;

  const starts = items.map((i) => i.start).sort();
  const ends = items.map((i) => i.end).sort();
  return { start: starts[0], end: ends[ends.length - 1] };
}

// --- Homework summary (16:00) ---

async function sendHomeworkSummary(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running homework summary...`);

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
    await sendMessage(TARGET_JID,"Ei läksyjä Wilmassa tänään! 🎉", IS_GROUP);
    return;
  }

  await sendMessage(TARGET_JID,lines.join("\n"), IS_GROUP);
  console.log("Homework summary sent.");
}

// --- Evening schedule + special events (20:00) ---

async function sendEveningSchedule(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running evening schedule...`);

  const [scheduleData, examsData] = await Promise.all([
    getWilmaSchedule({ when: "tomorrow" }) as Promise<{ students: StudentSchedule[] }>,
    getWilmaExams(20) as Promise<{ students: StudentExams[] }>,
  ]);

  const tomorrow = tomorrowISO();
  const lines: string[] = [];

  // Tomorrow's schedule
  const entries: Array<{ name: string; start: string; end: string }> = [];
  for (const student of scheduleData.students) {
    const times = getSchoolTimes(student);
    if (times) {
      entries.push({ name: firstName(student.student.name), ...times });
    }
  }

  if (entries.length === 0) {
    await sendMessage(TARGET_JID,`Huomenna ${tomorrowStr()} ei koulua! 🎉`, IS_GROUP);
    return;
  }

  entries.sort((a, b) => a.start.localeCompare(b.start));
  lines.push(`Huomenna ${tomorrowStr()} koulut:`);
  lines.push("");
  for (const e of entries) {
    lines.push(`${e.name} ${e.start}–${e.end}`);
  }

  // Tomorrow's special events - exams
  const specials: string[] = [];
  for (const student of examsData.students) {
    const name = firstName(student.student.name);
    const tomorrowExams = student.items.filter((e) => e.date === tomorrow);
    for (const exam of tomorrowExams) {
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

  await sendMessage(TARGET_JID,lines.join("\n"), IS_GROUP);
  console.log("Evening schedule sent.");
}

// --- Sunday weekly overview (next week's exams) ---

async function sendWeeklyOverview(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running weekly overview...`);

  const examsData = (await getWilmaExams(50)) as { students: StudentExams[] };

  const today = new Date();
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + 1); // tomorrow is Monday
  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);

  const mondayStr = nextMonday.toISOString().split("T")[0];
  const fridayStr = nextFriday.toISOString().split("T")[0];

  // Group exams by date
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
    await sendMessage(TARGET_JID,"Ensi viikolla ei kokeita eikä erikoisohjelmaa! 🎉", IS_GROUP);
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

  await sendMessage(TARGET_JID,lines.join("\n"), IS_GROUP);
  console.log("Weekly overview sent.");
}

// --- Schedule cron jobs ---

console.log("Parenting scheduler starting...");
console.log(`Target: ${config.whatsapp.targetName} (${TARGET_JID})`);

const { homeworkCron, eveningCron, weeklyCron, timezone } = config.schedule;

cron.schedule(homeworkCron, () => {
  sendHomeworkSummary().catch((err) =>
    console.error("Homework summary failed:", err)
  );
}, { timezone });

cron.schedule(eveningCron, () => {
  sendEveningSchedule().catch((err) =>
    console.error("Evening schedule failed:", err)
  );
}, { timezone });

cron.schedule(weeklyCron, () => {
  sendWeeklyOverview().catch((err) =>
    console.error("Weekly overview failed:", err)
  );
}, { timezone });

console.log("Scheduled:");
console.log(`  - Homework summary: ${homeworkCron}`);
console.log(`  - Tomorrow's schedule: ${eveningCron}`);
console.log(`  - Weekly overview: ${weeklyCron}`);
console.log("Running...");

// Graceful shutdown
function shutdown() {
  console.log("Shutting down scheduler...");
  disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

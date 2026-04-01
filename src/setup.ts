#!/usr/bin/env node

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getConnection, listGroups, listContacts, disconnect } from "./services/whatsapp.js";
import { loadConfig, saveConfig, isConfigured, type AppConfig, type OnlineCourseFilter } from "./services/config.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

async function askChoice(question: string, options: string[]): Promise<number> {
  console.log(`\n${question}`);
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}. ${options[i]}`);
  }
  while (true) {
    const answer = await ask(`Valinta (1-${options.length}): `);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) return num - 1;
    console.log("Virheellinen valinta, yritä uudelleen.");
  }
}

async function setupWhatsApp(config: AppConfig): Promise<void> {
  console.log("\n--- WhatsApp-yhteys ---");
  console.log("Yhdistetään WhatsAppiin...");
  console.log("Jos QR-koodi ilmestyy, skannaa se puhelimella.");
  console.log("(WhatsApp > Asetukset > Yhdistetyt laitteet > Yhdistä laite)\n");

  await getConnection();
  console.log("\nWhatsApp yhdistetty!\n");

  const targetType = await askChoice("Mihin viestit lähetetään?", [
    "WhatsApp-ryhmä",
    "Yksittäinen kontakti",
  ]);

  if (targetType === 0) {
    console.log("\nHaetaan ryhmiä...");
    const groups = await listGroups();
    if (groups.length === 0) {
      console.log("Ei ryhmiä löytynyt.");
      return;
    }
    groups.sort((a, b) => a.name.localeCompare(b.name));

    console.log("\nWhatsApp-ryhmät:");
    for (let i = 0; i < groups.length; i++) {
      console.log(`  ${i + 1}. ${groups[i].name} (${groups[i].participantCount} jäsentä)`);
    }

    while (true) {
      const answer = await ask(`\nValitse ryhmä (1-${groups.length}): `);
      const num = parseInt(answer, 10);
      if (num >= 1 && num <= groups.length) {
        const group = groups[num - 1];
        config.whatsapp.targetJid = group.jid;
        config.whatsapp.isGroup = true;
        config.whatsapp.targetName = group.name;
        console.log(`\nValittu: ${group.name}`);
        break;
      }
      console.log("Virheellinen valinta.");
    }
  } else {
    const search = await ask("Hae kontaktia (nimi tai numero): ");
    const contacts = await listContacts(search);

    if (contacts.length === 0) {
      console.log("Ei kontakteja löytynyt.");
      return;
    }

    console.log("\nKontaktit:");
    for (let i = 0; i < Math.min(contacts.length, 20); i++) {
      console.log(`  ${i + 1}. ${contacts[i].name} (${contacts[i].jid})`);
    }

    while (true) {
      const max = Math.min(contacts.length, 20);
      const answer = await ask(`\nValitse kontakti (1-${max}): `);
      const num = parseInt(answer, 10);
      if (num >= 1 && num <= max) {
        const contact = contacts[num - 1];
        config.whatsapp.targetJid = contact.jid;
        config.whatsapp.isGroup = false;
        config.whatsapp.targetName = contact.name;
        console.log(`\nValittu: ${contact.name}`);
        break;
      }
      console.log("Virheellinen valinta.");
    }
  }
}

async function setupFilters(config: AppConfig): Promise<void> {
  console.log("\n--- Verkkokurssisuodattimet ---");
  console.log("Jos jollain oppilaalla on verkkokursseja, jotka näkyvät lukujärjestyksessä");
  console.log("mutta eivät ole oikeaa lähiopetusta, ne voi suodattaa pois.\n");

  const addFilter = await ask("Lisätäänkö verkkokurssisuodatin? (k/e): ");
  if (addFilter.toLowerCase() !== "k") return;

  const filters: OnlineCourseFilter[] = [];
  let adding = true;

  while (adding) {
    const name = await ask("Oppilaan etunimi: ");
    const startTime = await ask("Verkkokurssien alkuaika (esim. 07:00): ");
    const patterns = await ask("Kurssikoodin osat pilkulla erotettuna (esim. Ver,verkko,YTO): ");

    filters.push({
      studentFirstName: name,
      startTime,
      subjectCodePatterns: patterns.split(",").map((p) => p.trim()),
    });

    const more = await ask("Lisätäänkö toinen suodatin? (k/e): ");
    adding = more.toLowerCase() === "k";
  }

  config.filters.onlineCourses = filters;
}

async function setupSchedule(config: AppConfig): Promise<void> {
  console.log("\n--- Ajastukset ---");
  console.log(`Läksykooste: ${config.schedule.homeworkCron}`);
  console.log(`Ilta-aikataulu: ${config.schedule.eveningCron}`);
  console.log(`Viikkokatsaus: ${config.schedule.weeklyCron}`);
  console.log(`Aikavyöhyke: ${config.schedule.timezone}`);

  const change = await ask("\nMuutetaanko ajastuksia? (k/e): ");
  if (change.toLowerCase() !== "k") return;

  const hw = await ask(`Läksykooste (cron, oletus ${config.schedule.homeworkCron}): `);
  if (hw) config.schedule.homeworkCron = hw;

  const ev = await ask(`Ilta-aikataulu (cron, oletus ${config.schedule.eveningCron}): `);
  if (ev) config.schedule.eveningCron = ev;

  const wk = await ask(`Viikkokatsaus (cron, oletus ${config.schedule.weeklyCron}): `);
  if (wk) config.schedule.weeklyCron = wk;

  const tz = await ask(`Aikavyöhyke (oletus ${config.schedule.timezone}): `);
  if (tz) config.schedule.timezone = tz;
}

// --- Main ---

console.log("=========================");
console.log("  Parenting MCP — Setup  ");
console.log("=========================\n");

const config = await loadConfig();

if (isConfigured(config)) {
  console.log(`Nykyinen kohde: ${config.whatsapp.targetName} (${config.whatsapp.targetJid})`);
  const reconfigure = await ask("Määritetäänkö uudelleen? (k/e): ");
  if (reconfigure.toLowerCase() !== "k") {
    console.log("Setup keskeytetty.");
    disconnect();
    rl.close();
    process.exit(0);
  }
}

try {
  await setupWhatsApp(config);
  await setupFilters(config);
  await setupSchedule(config);

  await saveConfig(config);
  console.log("\nAsetukset tallennettu tiedostoon config.json.");
  console.log("Käynnistä scheduler uudelleen: systemctl --user restart parenting-scheduler");
} catch (error) {
  console.error("\nSetup epäonnistui:", error);
} finally {
  disconnect();
  rl.close();
  process.exit(0);
}

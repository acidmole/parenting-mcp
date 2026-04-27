import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  type WASocket,
  type GroupMetadata,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { logError } from "./error-log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = resolve(__dirname, "../../auth_store");
const MIN_SEND_INTERVAL_MS = 2000;

let sock: WASocket | null = null;
let connectionPromise: Promise<void> | null = null;
let lastSendTime = 0;
const groupCache = new Map<string, GroupMetadata>();

function resetConnection(): void {
  if (sock) {
    try {
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("groups.update");
      sock.ev.removeAllListeners("group-participants.update");
      sock.end(undefined);
    } catch {
      // socket may already be dead — ignore
    }
  }
  sock = null;
  connectionPromise = null;
  groupCache.clear();
}

async function initConnection(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const logger = pino({ level: "warn" }, pino.destination(2)); // stderr

  sock = makeWASocket({
    auth: state,
    logger,
    version: [2, 3000, 1034074495],
    browser: Browsers.macOS("Desktop"),
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("groups.update", (updates) => {
    for (const u of updates) {
      if (!u.id) continue;
      const existing = groupCache.get(u.id);
      if (existing) {
        groupCache.set(u.id, { ...existing, ...u } as GroupMetadata);
      }
    }
  });

  sock.ev.on("group-participants.update", (update) => {
    const existing = groupCache.get(update.id);
    if (!existing) return;
    let participants = existing.participants;
    if (update.action === "add") {
      const known = new Set(participants.map((p) => p.id));
      participants = [
        ...participants,
        ...update.participants
          .filter((id) => !known.has(id))
          .map((id) => ({ id, isAdmin: false, isSuperAdmin: false })),
      ];
    } else if (update.action === "remove") {
      const removed = new Set(update.participants);
      participants = participants.filter((p) => !removed.has(p.id));
    } else if (update.action === "promote" || update.action === "demote") {
      const changed = new Set(update.participants);
      const isAdmin = update.action === "promote";
      participants = participants.map((p) =>
        changed.has(p.id) ? { ...p, isAdmin } : p
      );
    }
    groupCache.set(update.id, { ...existing, participants });
  });

  return new Promise<void>((resolvePromise, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resetConnection();
        const err = new Error(
          "WhatsApp connection timed out (60s). If this is first login, scan the QR code in the terminal running the MCP server."
        );
        void logError("whatsapp", "connection timeout", err);
        reject(err);
      }
    }, 60_000);

    sock!.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.error("\nScan this QR code with WhatsApp:");
        qrcode.generate(qr, { small: true }, (code: string) => {
          console.error(code);
        });
      }

      if (connection === "open") {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          console.error("WhatsApp connected successfully");
          // Pre-warm group metadata cache so per-send fetches don't happen.
          // Errors are non-fatal — sends will fall back to live fetch.
          sock!
            .groupFetchAllParticipating()
            .then((groups) => {
              for (const [jid, meta] of Object.entries(groups)) {
                groupCache.set(jid, meta);
              }
            })
            .catch((err) =>
              void logError("whatsapp", "group cache prewarm failed", err)
            );
          resolvePromise();
        }
      }

      if (connection === "close") {
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } }
        )?.output?.statusCode;

        clearTimeout(timeout);
        resetConnection();

        if (statusCode === DisconnectReason.loggedOut) {
          void logError("whatsapp", "session expired (loggedOut), clearing auth", `statusCode=${statusCode}`);
          console.error(
            "\n⚠️  WhatsApp session expired — clearing old session and requesting new QR code...\n"
          );
          rm(AUTH_DIR, { recursive: true, force: true })
            .then(() => {
              if (!settled) {
                settled = true;
                // Restart connection — will show QR code automatically
                connectionPromise = initConnection();
                connectionPromise.then(resolvePromise, reject);
              } else {
                // Was connected, session expired mid-run — reconnect for next use
                connectionPromise = initConnection();
                connectionPromise.catch((err) => {
                  void logError("whatsapp", "re-auth failed (QR not scanned in time)", err);
                  console.error("WhatsApp re-auth failed. QR code was not scanned in time.");
                  resetConnection();
                });
              }
            })
            .catch(reject);
          return;
        }

        if (!settled) {
          settled = true;
          const err = new Error(
            `WhatsApp disconnected (code ${statusCode}), will retry`
          );
          void logError("whatsapp", "initial connection closed", err);
          reject(err);
        } else {
          console.error(
            `WhatsApp disconnected (code ${statusCode}), will reconnect on next use`
          );
        }
      }
    });
  });
}

export async function getConnection(): Promise<WASocket> {
  if (sock) return sock;
  if (connectionPromise) {
    await connectionPromise;
    return sock!;
  }
  connectionPromise = initConnection();
  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
  return sock!;
}

async function rateLimitedSend() {
  const now = Date.now();
  const elapsed = now - lastSendTime;
  if (elapsed < MIN_SEND_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_SEND_INTERVAL_MS - elapsed));
  }
  lastSendTime = Date.now();
}

export async function sendMessage(
  jid: string,
  text: string,
  isGroup: boolean
): Promise<void> {
  // Normalize JID
  let targetJid = jid;
  if (isGroup && !jid.endsWith("@g.us")) {
    targetJid = `${jid}@g.us`;
  } else if (!isGroup && !jid.includes("@")) {
    targetJid = `${jid}@s.whatsapp.net`;
  }

  // Try once, reconnect and retry on failure
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const conn = await getConnection();
      await rateLimitedSend();
      await conn.sendMessage(targetJid, { text });
      return;
    } catch (error) {
      if (attempt === 0) {
        void logError("whatsapp", `send failed to ${targetJid} (retrying)`, error);
        console.error("WhatsApp send failed, reconnecting and retrying...");
        resetConnection();
        continue;
      }
      void logError("whatsapp", `send failed to ${targetJid} (giving up)`, error);
      throw error;
    }
  }
}

export async function listGroups(): Promise<
  Array<{ jid: string; name: string; participantCount: number }>
> {
  const conn = await getConnection();
  const groups = await conn.groupFetchAllParticipating();

  return Object.values(groups).map((g) => ({
    jid: g.id,
    name: g.subject,
    participantCount: g.participants.length,
  }));
}

export async function listContacts(
  search?: string
): Promise<Array<{ jid: string; name: string }>> {
  const conn = await getConnection();

  // Baileys stores contacts via events; we use the store if available
  // For a simpler approach, we return contacts from connection state
  const contacts: Array<{ jid: string; name: string }> = [];

  // Try to get contacts from the connection store
  const store = (conn as unknown as { store?: { contacts?: Record<string, { id: string; name?: string; notify?: string }> } }).store;
  if (store?.contacts) {
    for (const [jid, contact] of Object.entries(store.contacts)) {
      const name = contact.name || contact.notify || jid;
      if (!search || name.toLowerCase().includes(search.toLowerCase())) {
        contacts.push({ jid, name });
      }
    }
  }

  // If no store contacts, try fetching from groups as a fallback
  if (contacts.length === 0) {
    const groups = await conn.groupFetchAllParticipating();
    const seen = new Set<string>();
    for (const group of Object.values(groups)) {
      for (const p of group.participants) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          const name = p.id.split("@")[0];
          if (!search || name.includes(search)) {
            contacts.push({ jid: p.id, name });
          }
        }
      }
    }
  }

  return contacts;
}

export function disconnect(): void {
  if (sock) {
    sock.end(undefined);
    resetConnection();
  }
}

// Graceful shutdown
process.on("SIGTERM", disconnect);
process.on("SIGINT", disconnect);

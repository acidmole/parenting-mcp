#!/usr/bin/env node

/**
 * Standalone script to authenticate WhatsApp.
 * Run: npm run whatsapp-auth
 * Scan the QR code with your phone, then press Ctrl+C when done.
 */

import { getConnection, disconnect } from "./services/whatsapp.js";

console.log("WhatsApp Authentication");
console.log("=======================");
console.log("Scan the QR code below with your WhatsApp app:");
console.log("(Phone > Settings > Linked Devices > Link a Device)");
console.log("");

try {
  await getConnection();
  console.log("");
  console.log("Authenticated successfully! Session saved to auth_store/");
  console.log("You can now close this with Ctrl+C.");
  console.log("");
  // Keep process alive so user can verify
  await new Promise(() => {});
} catch (error) {
  console.error("Authentication failed:", error);
  process.exit(1);
} finally {
  disconnect();
}

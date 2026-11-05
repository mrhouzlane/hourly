#!/usr/bin/env node
// Approve an owner for the Hourly Founding Board (they must also have ticked "Show my name").
// Usage: node scripts/approve-founder.js "Company or name"     (no argument: list pending opt ins)
const fs = require("fs"), path = require("path");
const STATE = path.join(__dirname, "..", "state"), F = path.join(STATE, "founders-approved.txt");
const norm = (t) => t.trim().toLowerCase().replace(/\s+/g, " ");
const seats = (() => { try { return fs.readFileSync(path.join(STATE, "seats.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; } })();
const ok = (() => { try { return new Set(fs.readFileSync(F, "utf8").split("\n").map(norm).filter(Boolean)); } catch (_) { return new Set(); } })();
const name = process.argv.slice(2).join(" ");
if (!name) {
  const who = (s) => s.company || s.name;
  const pending = [...new Set(seats.filter((s) => s.show && !ok.has(norm(who(s)))).map(who))];
  console.log(pending.length ? "pending opt ins:\n" + pending.join("\n") : "no pending opt ins");
  process.exit(0);
}
if (!seats.some((s) => s.show && norm(s.company || s.name) === norm(name))) { console.error("no seat request with that company or name that asked to be shown"); process.exit(1); }
fs.appendFileSync(F, norm(name) + "\n", { mode: 0o600 });
console.log("approved", name, "(restart not needed)");

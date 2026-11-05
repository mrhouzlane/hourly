"use strict";
// Community backend for the home page: H100 range guesses, the Founding Tester board, and the 50 Founding GPU Owner seats.
// Storage: one JSON line per record in state/ (same pattern as access-requests.jsonl). Nothing here moves funds.
// Index hold: the board only scores once INDEX_PUBLIC=true. Until then it answers {revealed:false} and no print value leaves the server.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE = path.join(__dirname, "..", "state");
const F = { guesses: path.join(STATE, "guesses.jsonl"), seats: path.join(STATE, "seats.jsonl"), access: path.join(STATE, "access-requests.jsonl"), salt: path.join(STATE, "community-salt") };
const SEATS_TOTAL = 50;
const GPU_RANGES = ["Under 64", "64 to 511", "512 to 4k", "4k plus"];
const INDEX_PUBLIC = () => process.env.INDEX_PUBLIC === "true";

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
function readLines(f) {
  try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; }
}
async function append(f, rec) {
  await fs.promises.mkdir(STATE, { recursive: true, mode: 0o700 });
  await fs.promises.appendFile(f, JSON.stringify(rec) + "\n", { mode: 0o600 });
}
// IPs are kept only as a salted hash, for the per day limit.
let salt = null;
function ipHash(ip) {
  if (!salt) {
    try { salt = fs.readFileSync(F.salt, "utf8").trim(); } catch (_) { salt = crypto.randomBytes(16).toString("hex"); fs.mkdirSync(STATE, { recursive: true, mode: 0o700 }); fs.writeFileSync(F.salt, salt, { mode: 0o600 }); }
  }
  return crypto.createHash("sha256").update(salt + "|" + String(ip || "")).digest("hex").slice(0, 32);
}
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const cleanRef = (r) => (typeof r === "string" && /^[\w.-]{1,64}$/.test(r) ? r : null);
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const guesses = readLines(F.guesses);
const seats = readLines(F.seats);

// ---------- guesses ----------
async function addGuess(body, ip) {
  const low = Number(body && body.low), high = Number(body && body.high);
  if (!Number.isFinite(low) || !Number.isFinite(high) || !(low > 0 && low < high && high < 100)) throw httpError(400, "Enter a Low and a High, with 0 < Low < High < 100.");
  let x = str(body && body.x, 32);
  if (x) { if (!/^@?[A-Za-z0-9_]{1,15}$/.test(x)) throw httpError(400, "X handles are letters, numbers and _ only, up to 15."); x = "@" + x.replace(/^@/, ""); }
  const day = utcDay(), ih = ipHash(ip);
  if (guesses.filter((g) => g.day === day && g.ip === ih).length >= 3) throw httpError(429, "Three guesses a day from one connection. Come back tomorrow.");
  if (x && guesses.some((g) => g.day === day && g.x && g.x.toLowerCase() === x.toLowerCase())) throw httpError(429, `${x} already guessed today.`);
  const rec = { id: crypto.randomBytes(6).toString("hex"), at: new Date().toISOString(), day, chip: "H100", low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100, x: x || null, ref: cleanRef(body && body.ref), ip: ih };
  await append(F.guesses, rec);
  guesses.push(rec);
  return { id: rec.id, day, status: "queued", reveal: "Revealed at next print" };
}

// Index range for scoring: each source once, narrowest band that holds 80% of them.
function band80(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 5) return null;
  const k = Math.ceil(v.length * 0.8);
  let best = null;
  for (let i = 0; i + k - 1 < v.length; i++) { const w = v[i + k - 1] - v[i]; if (!best || w < best.w) best = { w, low: v[i], high: v[i + k - 1] }; }
  return { low: best.low, high: best.high, n: v.length };
}
function printFor(day) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(STATE, "index-prints.json"), "utf8"));
    const d = (data.chips.H100 || []).find((x) => x.day === day && x.value !== null);
    return d ? band80((d.providers || []).map((p) => p.usd_hr)) : null;
  } catch (_) { return null; }
}
function board(day) {
  const days = [...new Set(guesses.map((g) => g.day))].sort();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day : (days.filter((x) => x < utcDay()).pop() || days.pop() || utcDay());
  const n = guesses.filter((g) => g.day === d).length;
  if (!INDEX_PUBLIC()) return { day: d, revealed: false, guesses: n, note: "Revealed at next print" };
  const p = printFor(d);
  if (!p) return { day: d, revealed: false, guesses: n, note: "Revealed at next print" };
  const rows = guesses.filter((g) => g.day === d)
    .map((g) => ({ x: g.x, low: g.low, high: g.high, score: Math.round((Math.abs(g.low - p.low) + Math.abs(g.high - p.high)) * 10000) / 10000, at: g.at }))
    .sort((a, b) => a.score - b.score || a.at.localeCompare(b.at)).slice(0, 10)
    .map((r, i) => ({ rank: i + 1, x: r.x, low: r.low, high: r.high, score: r.score }));
  return { day: d, revealed: true, guesses: n, print: { low: p.low, high: p.high, sources: p.n }, rows };
}

// ---------- seats ----------
async function addSeat(body, ip) {
  const rec = { at: new Date().toISOString(), name: str(body && body.name, 80), company: str(body && body.company, 80), gpus: GPU_RANGES.includes(body && body.gpus) ? body.gpus : "", email: str(body && body.email, 120), show: body && body.show === true, ref: cleanRef(body && body.ref), ip: ipHash(ip) };
  const missing = [];
  if (!rec.name) missing.push("name");
  if (!rec.gpus) missing.push("gpus");
  if (rec.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) missing.push("email");
  if (missing.length) { const e = httpError(400, "Name and GPUs you run are required. Email is optional but must be valid."); e.fields = missing; throw e; }
  await append(F.seats, rec);
  seats.push(rec);
  // Also into the existing Request access inbox, so nothing is lost.
  await append(F.access, { at: rec.at, source: "seat", company: rec.company, email: rec.email, name: rec.name, role: "GPU owner", chips: [], gpuCount: rec.gpus, ref: rec.ref });
  return { ok: true, ...seatCount() };
}
// A seat is one owner (company if given, else name): repeat requests do not count twice. Never above 50.
const seatKey = (s) => (s.company || s.name).toLowerCase().replace(/\s+/g, " ");
function seatCount() {
  const claimed = new Set(seats.map(seatKey)).size;
  return { claimed: Math.min(claimed, SEATS_TOTAL), total: SEATS_TOTAL, waitlist: Math.max(0, claimed - SEATS_TOTAL) };
}

// ---------- Hourly Founding Board ----------
// An owner is listed only if they ticked "Show my name" AND the Hourly team approved them
// (one company or name per line in state/founders-approved.txt, added with scripts/approve-founder.js).
function approved() {
  try { return new Set(fs.readFileSync(path.join(STATE, "founders-approved.txt"), "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean)); } catch (_) { return new Set(); }
}
function founders() {
  const ok = approved(), seen = new Set(), rows = [];
  for (const s of seats) {
    const k = seatKey(s);
    if (!s.show || !ok.has(k) || seen.has(k)) continue;
    seen.add(k); rows.push({ who: s.company || s.name, gpus: s.gpus, day: s.at.slice(0, 10) });
  }
  return { rows: rows.slice(0, SEATS_TOTAL) };
}

// ---------- admin: counts by ref (read from the files, for scripts/refs.js) ----------
function byRef() {
  const out = {};
  const add = (ref, k) => { const r = ref || "(none)"; out[r] = out[r] || { guesses: 0, seats: 0 }; out[r][k]++; };
  readLines(F.guesses).forEach((g) => add(g.ref, "guesses"));
  readLines(F.seats).forEach((s) => add(s.ref, "seats"));
  return out;
}

module.exports = { addGuess, board, addSeat, seatCount, founders, byRef, band80 };

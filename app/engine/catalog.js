// What the venue lists. Strikes are set from the live index at listing time and
// then fixed on chain; the keeper rolls new prediction markets every day.
"use strict";
const ornn = require("./ornn");

const USD = 1_000_000; // quote atoms per dollar (6 decimals)
const atoms = (usd) => Math.round(usd * USD);
const HOUR = 3600;
const EXPIRY_HOUR_UTC = 23; // prints land at 20:00 or 21:00 UTC; settle from 23:00

const epoch = (date, hour = 0) => Math.floor(Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) / 1000);

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function roundTo(v, step) {
  return Math.round(v / step) * step;
}

// Strike grid per GPU: step sized to the price level.
const STEP = { H100_SXM: 0.05, H200: 0.25, B200: 0.25, A100_SXM4: 0.05 };

// A single-print prediction market: pays $1 if that day's print is above strike.
function digital(code, date, strike) {
  const dates = [date];
  return {
    door: "predict",
    underlying: code,
    kind: 2,
    strike: atoms(strike),
    cap: USD,
    units: 1,
    periodStart: epoch(date, 0),
    expiry: epoch(date, EXPIRY_HOUR_UTC),
    dates,
    title: `${ornn.GPUS[code].label} print on ${date} above $${strike.toFixed(2)}`,
  };
}

// A monthly average contract sized like ICE's OCPI future: one GPU for every
// hour of the month. Calls and puts are spreads so every contract is fully backed.
function monthly(code, monthStart, kind, strike, width) {
  const first = `${monthStart}-01`;
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  const last = next.toISOString().slice(0, 10);
  const dates = ornn.datesBetween(first, last);
  const hours = dates.length * 24;
  const label = ornn.GPUS[code].label;
  const month = new Date(`${first}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return {
    door: "hedge",
    underlying: code,
    kind,
    strike: atoms(strike),
    cap: atoms(width),
    units: hours,
    periodStart: epoch(first, 0),
    expiry: epoch(last, EXPIRY_HOUR_UTC),
    dates,
    title: kind === 1
      ? `${label} ${month} average below $${strike.toFixed(2)} (floor, $${width.toFixed(2)} wide)`
      : `${label} ${month} average above $${strike.toFixed(2)} (cap, $${width.toFixed(2)} wide)`,
  };
}

// Initial and rolling listings, given the latest print per GPU.
function predictListings(lastByCode, fromDate) {
  const out = [];
  // next three daily prints for H100, the benchmark chip
  const h = lastByCode.H100_SXM;
  if (h) {
    for (let i = 1; i <= 3; i++) {
      const date = addDays(fromDate, i);
      out.push(digital("H100_SXM", date, roundTo(h, STEP.H100_SXM)));
    }
  }
  // next Friday print for every GPU, two strikes around the last print
  const d = new Date(`${fromDate}T00:00:00Z`);
  const toFri = (5 - d.getUTCDay() + 7) % 7 || 7;
  const friday = addDays(fromDate, toFri);
  for (const [code, last] of Object.entries(lastByCode)) {
    const atm = roundTo(last, STEP[code]);
    for (const k of [atm, atm + STEP[code]]) out.push(digital(code, friday, Number(k.toFixed(2))));
  }
  return out;
}

function hedgeListings(lastByCode, month) {
  const out = [];
  const spec = {
    H100_SXM: { put: 0.9, call: 1.13, width: 0.5 },
    H200: { put: 0.85, call: 1.15, width: 1.0 },
    B200: { put: 0.9, call: 1.12, width: 1.0 },
    A100_SXM4: { put: 0.9, call: 1.15, width: 0.2 },
  };
  for (const [code, last] of Object.entries(lastByCode)) {
    const s = spec[code];
    const put = Number(roundTo(last * s.put, STEP[code]).toFixed(2));
    const call = Number(roundTo(last * s.call, STEP[code]).toFixed(2));
    out.push(monthly(code, month, 1, put, Math.min(s.width, put)));
    out.push(monthly(code, month, 0, call, s.width));
  }
  return out;
}

module.exports = { USD, atoms, addDays, epoch, digital, monthly, predictListings, hedgeListings, EXPIRY_HOUR_UTC };

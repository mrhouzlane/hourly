#!/usr/bin/env node
// Admin: guesses and seat requests counted by ?ref= (reads app/state/*.jsonl on this machine). Usage: node scripts/refs.js
const c = require("../engine/community");
const rows = Object.entries(c.byRef()).sort((a, b) => (b[1].guesses + b[1].seats) - (a[1].guesses + a[1].seats));
console.log("ref".padEnd(28) + "guesses".padStart(9) + "seats".padStart(7));
for (const [ref, v] of rows) console.log(ref.padEnd(28) + String(v.guesses).padStart(9) + String(v.seats).padStart(7));
console.log("seats claimed", JSON.stringify(c.seatCount()));

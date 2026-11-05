#!/usr/bin/env node
// Copy rules test (run in CI): visible UI text must not use banned words, banned names or dashes.
// Reads the string literals of the UI sources (comments, code identifiers and regexes are skipped),
// keeps only prose (a literal with a space or HTML), strips tags and ${...}, then checks the rules.
// Usage: node scripts/copy-check.js   (exit 1 on any hit)
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = ["src/site.js", "src/debt.js", "src/v3.js", "public/index.html"];
const RULES = [
  [/\bcrypto\w*/i, "say onchain"], [/\bbet(s|ting|tor)?\b/i, "banned word"], [/\bodds\b/i, "banned word"], [/\bpredict\w*/i, "banned word"],
  [/\bwin(s|ning|ner|ners)?\b/i, "banned word"], [/\byield\w*/i, "banned word"], [/\bapy\b/i, "banned word"], [/\bguarantee\w*/i, "banned word"],
  [/\binsurance\b/i, "banned word"], [/\bmax loss\b/i, "banned word"], [/\bimplied chance\b/i, "banned word"], [/\bsettle\w*/i, "say pays out"],
  [/\bclosed\b/i, "banned word"],
  [/\bornn\b/i, "banned name"], [/usd\.ai/i, "banned name"], [/hydra host/i, "banned name"], [/forwardhour/i, "banned name"], [/\byc\b/i, "banned name"], [/moneyness/i, "banned name"],
  [/[–—]/, "no em or en dashes"],
];

// Minimal JS tokenizer: returns string and template literal contents (template ${} parts removed).
function literals(src) {
  const out = []; let i = 0, prev = "";
  const regexOk = () => /[(,=:[!&|?{};+\-*%<>~^]$|^$|\breturn$|\btypeof$|\bcase$/.test(prev.trimEnd());
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && n === "*") { i = src.indexOf("*/", i + 2) + 2; if (i < 2) break; continue; }
    if (c === "/" && regexOk()) { // regex literal
      i++; let cls = false;
      while (i < src.length && (src[i] !== "/" || cls)) { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
      i++; while (/[a-z]/.test(src[i] || "")) i++; prev = "x"; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) { if (src[j] === "\\") { s += src[j + 1]; j += 2; } else s += src[j++]; }
      out.push(s); i = j + 1; prev = "x"; continue;
    }
    if (c === "`") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") { s += src[j + 1]; j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") { // skip the expression, but scan it for nested literals
          let d = 1, k = j + 2; while (k < src.length && d) { if (src[k] === "{") d++; else if (src[k] === "}") d--; else if (src[k] === "`" || src[k] === '"' || src[k] === "'") { const q = src[k]; k++; while (k < src.length && src[k] !== q) { if (src[k] === "\\") k++; k++; } } k++; }
          out.push(...literals(src.slice(j + 2, k - 1))); s += " "; j = k; continue;
        }
        s += src[j++];
      }
      out.push(s); i = j + 1; prev = "x"; continue;
    }
    if (!/\s/.test(c)) prev = (prev + c).slice(-8);
    i++;
  }
  return out;
}
const visible = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");
const isProse = (s) => /\s/.test(s.trim()) || /<[a-z]/i.test(s);
// Literals that are attribute values, URLs or code, not words a visitor reads.
const SKIP = [/^https?:\/\//, /^[\w./:-]+$/];

let hits = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  let texts;
  if (f.endsWith(".html")) texts = [visible(src), ...[...src.matchAll(/<meta[^>]+content="([^"]+)"/g)].map((m) => m[1])];
  else texts = literals(src).filter(isProse).map(visible);
  for (const t of texts) {
    const line = t.replace(/\s+/g, " ").trim();
    if (!line || SKIP.some((r) => r.test(line))) continue;
    for (const [re, why] of RULES) {
      const m = re.exec(line);
      if (m) { hits++; console.log(`${f}: "${m[0]}" (${why}) in: ${line.slice(Math.max(0, m.index - 50), m.index + 50)}`); }
    }
  }
}
if (hits) { console.log(`\n${hits} copy rule hit(s).`); process.exit(1); }
console.log("copy rules: clean");

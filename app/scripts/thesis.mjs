// docs/LITEPAPER.md -> public/thesis.json ({toc, html}). Tiny converter: headings, paragraphs, lists, tables, code, inline.
import fs from "fs";
const src = fs.readFileSync("../docs/LITEPAPER.md", "utf8").replace(/\r/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const lines = src.split("\n"), out = [], toc = [];
let i = 0, title = "";
while (i < lines.length) {
  const l = lines[i];
  if (/^```/.test(l)) { const b = []; i++; while (i < lines.length && !/^```/.test(lines[i])) b.push(lines[i++]); i++; out.push(`<pre>${esc(b.join("\n"))}</pre>`); continue; }
  const h = l.match(/^(#{1,4})\s+(.*)/);
  if (h) { const n = h[1].length, t = h[2].replace(/\*+/g, ""); if (n === 1 && !title) title = t; else { if (n === 2) toc.push([slug(t), t]); out.push(`<h${n} id="${slug(t)}">${inline(h[2])}</h${n}>`); } i++; continue; }
  if (/^\|.*\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
    const row = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const head = row(l); i += 2; const body = [];
    while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
    out.push(`<div class="tw"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue;
  }
  if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
    const ord = /^\s*\d+\./.test(l), items = [];
    while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")); i++; }
    out.push(`<${ord ? "ol" : "ul"}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${ord ? "ol" : "ul"}>`); continue;
  }
  if (/^>\s?/.test(l)) { const b = []; while (i < lines.length && /^>\s?/.test(lines[i])) b.push(lines[i++].replace(/^>\s?/, "")); out.push(`<p class="note">${inline(b.join(" "))}</p>`); continue; }
  if (!l.trim()) { i++; continue; }
  const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||\s*([-*]|\d+\.)\s|>)/.test(lines[i])) p.push(lines[i++]);
  out.push(`<p>${inline(p.join(" "))}</p>`);
}
fs.writeFileSync("public/thesis.json", JSON.stringify({ title, toc, html: out.join("\n") }));
console.log("thesis", toc.length, "sections");

import { char, CAST } from "../src/chars.mjs";
import fs from "fs";
fs.mkdirSync("public/characters", { recursive: true });
const css = `.char{width:100%;height:auto;overflow:visible}.char .pupil{animation:look 6s ease-in-out infinite}.char .hand.h{transform-box:view-box;transform-origin:60px 68px;animation:spin 43200s linear infinite}.char .hand.m{transform-box:view-box;transform-origin:60px 68px;animation:spin 3600s linear infinite}@keyframes look{0%,40%{transform:translate(0,0)}50%,70%{transform:translate(3px,-1px)}80%,100%{transform:translate(-3px,1px)}}@keyframes spin{to{transform:rotate(360deg)}}`;
for (const code of Object.keys(CAST)) {
  const svg = char(code).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace(">", `><style>${css}</style>`);
  fs.writeFileSync(`public/characters/${CAST[code].name.toLowerCase()}.svg`, svg);
}
const cards = Object.entries(CAST).map(([code, c]) => `<figure><div class="stage" style="--c:${c.color}">${char(code)}</div><figcaption><b>${c.name}</b><span>${code.replace(/_/g, " ")}</span><p>${c.role}</p></figcaption></figure>`).join("");
fs.writeFileSync("public/characters.html", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hourly cast</title>
<link rel="icon" href="mark.svg"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;600;800&display=swap" rel="stylesheet">
<style>${css}body{margin:0;background:#05070f;color:#fff;font-family:Manrope,system-ui,sans-serif}main{max-width:1200px;margin:0 auto;padding:64px 24px}h1{font-size:clamp(40px,6vw,84px);letter-spacing:-.045em;margin:0 0 8px;font-weight:800}h1 i{font-family:"Instrument Serif",serif;font-weight:400;color:#6fa0ff}p.lead{color:#9aa3c7;font-size:20px;margin:0 0 48px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}figure{margin:0;background:#0c1124;border-radius:28px;padding:20px;border:1px solid #1b2347}.stage{background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--c) 35%,transparent),transparent 70%);border-radius:20px;padding:24px;animation:bob 4s ease-in-out infinite}figure:nth-child(2) .stage{animation-delay:-1s}figure:nth-child(3) .stage{animation-delay:-2s}figure:nth-child(4) .stage{animation-delay:-3s}@keyframes bob{50%{transform:translateY(-8px)}}figcaption b{font-size:28px;display:block;margin-top:14px}figcaption span{font:500 12px ui-monospace,monospace;color:#6fa0ff;letter-spacing:.1em}figcaption p{color:#9aa3c7;margin:8px 0 0}</style>
<main><h1>Meet the <i>cast.</i></h1><p class="lead">One clock, four chips, four personalities. For the video.</p><div class="grid">${cards}</div></main>`);
console.log("ok");

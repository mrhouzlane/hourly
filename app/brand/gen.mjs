import fs from "fs";
const B="#3d7bff", W="#f2f5ff";
// A: price tick inside hour ring
const A=(f=W,s=B)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="${f}" stroke-width="4"/><path d="M32 16V48M32 25H23M32 39H41" stroke="${s}" stroke-width="4.5" stroke-linecap="square" fill="none"/></svg>`;
// B: H built from two candles + crossbar tick
const Bm=(f=W,s=B)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M18 8V56M46 8V56" stroke="${f}" stroke-width="10" stroke-linecap="butt"/><rect x="13" y="29" width="38" height="7" fill="${s}"/></svg>`;
// C: 24-hour ring, current hour lit
const C=(f=W,s=B)=>{let t="";for(let i=0;i<24;i++){const a=i*15,lit=i===0;t+=`<line x1="32" y1="${lit?3:6}" x2="32" y2="${lit?19:14}" stroke="${lit?s:f}" stroke-width="${lit?4.5:2.6}" stroke-linecap="butt" transform="rotate(${a} 32 32)" ${lit?"":'opacity=".75"'}/>`}return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${t}<circle cx="32" cy="32" r="3.2" fill="${s}"/></svg>`};
const M={A,B:Bm,C};
for(const k in M){fs.writeFileSync(`mark-${k}.svg`,M[k]());}
const card=(k,bg,fg,sg)=>`<div class="c" style="background:${bg}"><div class="big">${M[k](fg,sg)}</div><div class="row"><div class="s32">${M[k](fg,sg)}</div><div class="s16">${M[k](fg,sg)}</div><span style="color:${fg}">Hourly</span></div></div>`;
fs.writeFileSync("sheet.html",`<style>body{margin:0;background:#05070d;font-family:Manrope,sans-serif;padding:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:1200px}.c{border-radius:14px;padding:24px;height:330px;position:relative}.big{width:170px;height:170px}.row{position:absolute;left:24px;bottom:24px;display:flex;gap:14px;align-items:center}.s32{width:32px;height:32px}.s16{width:16px;height:16px}.row span{font-weight:700;font-size:20px;letter-spacing:-.02em}h3{grid-column:1/-1;color:#8a95b8;margin:0;font:12px monospace}svg{width:100%;height:100%}</style>
<h3>A tick-in-ring / B candle-H / C 24h ring</h3>
${["A","B","C"].map(k=>card(k,"#05070d",W,B)).join("")}
${["A","B","C"].map(k=>card(k,"#f4f6fb","#0a1230",B)).join("")}`);

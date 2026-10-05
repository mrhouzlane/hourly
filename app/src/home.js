// Home: the vision, told by scroll. Dark dial hero, one huge word, a sticky stack of four layers, a loop, the next assets.
import { char, CAST } from "./chars.mjs";

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i * 6 * Math.PI) / 180, big = i % 5 === 0, r1 = 470, r2 = big ? 440 : 455;
  return `<line x1="${(500 + Math.sin(a) * r1).toFixed(1)}" y1="${(500 - Math.cos(a) * r1).toFixed(1)}" x2="${(500 + Math.sin(a) * r2).toFixed(1)}" y2="${(500 - Math.cos(a) * r2).toFixed(1)}" stroke="#fff" stroke-width="${big ? 4 : 2}" opacity="${big ? 0.9 : 0.4}"/>`;
}).join("");

const LAYERS = [
  { n: "01", t: "Price", s: "Built", d: "One trusted daily price for what a chip earns per hour. Read from a public index, settled by an oracle network, checked on chain.", k: "Index to oracle to contract" },
  { n: "02", t: "Hedge", s: "Built", d: "Floors for owners, caps for renters, yes or no on any day. Every contract fully backed in escrow. No margin calls.", k: "Today's product" },
  { n: "03", t: "Credit", s: "Next", d: "Lend against chips with the floor attached. The loan is protected by the hedge, so it needs no liquidations.", k: "Needs the first two to be trusted" },
  { n: "04", t: "Benchmark", s: "Next", d: "Other lenders, contracts and companies point at the same price. The venue becomes the reference.", k: "Earned, never declared" },
];
const ASSETS = [
  ["H100", "live"], ["H200", "live"], ["B200", "live"], ["A100", "live"],
  ["Tokens", "next"], ["Memory", "next"], ["Power", "next"], ["Capacity", "next"],
];
const LOOP = ["Index", "Oracle", "Contract", "Settlement"];

export function homeView() {
  const words = (s) => s.split(" ").map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(" ");
  return `<div class="home">
  <section class="hhero">
    <svg class="dial" viewBox="0 0 1000 1000" aria-hidden="true"><g class="dialring">${TICKS}</g>
      <g class="dh"><line x1="500" y1="500" x2="500" y2="270" stroke="#fff" stroke-width="14" stroke-linecap="round"/></g>
      <g class="dm"><line x1="500" y1="500" x2="500" y2="110" stroke="#6fa0ff" stroke-width="8" stroke-linecap="round"/></g><circle cx="500" cy="500" r="16" fill="#fff"/></svg>
    <div class="hh">
      <div class="wm">HOURLY</div>
      <h1 class="hl">${words("The price layer for compute.")}</h1>
      <p class="hs">Compute is becoming a commodity. Every commodity needs a price people can trade against.</p>
      <div class="hcta"><button class="lp" data-go="trade">Launch App <i>↗</i></button><button class="lp ghost" data-go="thesis">Read the thesis</button></div>
    </div>
    <div class="hchar">${char("H200")}</div>
    <div class="scroll">Scroll</div>
  </section>

  <section class="hword"><div class="hwi" data-rev>
    <p class="small">The cost no one can hedge is</p>
    <div class="huge" id="huge">RENT</div>
    <p class="not">Not talent. Not <em>ideas.</em></p>
    <p class="sub2">A chip's price moves every day. The people who own chips, finance them or rent them have had no way to hedge it. Hourly is the venue for that price.</p>
  </div></section>

  <section class="stack" id="stack">
    <div class="stickybox">
      <div class="stlabel"><span id="stn">1</span>/4</div>
      <div class="stcards">${LAYERS.map((l, i) => `<article class="scard ${l.s.toLowerCase()}" style="--i:${i}"><span class="num">${l.n}</span><span class="tag">${l.s}</span><h3>${l.t}</h3><p>${l.d}</p><em>${l.k}</em></article>`).join("")}</div>
      <div class="sthead"><h2 data-rev>Four layers. <i>One direction.</i></h2><p data-rev>Each layer earns the right to build the next.</p></div>
    </div>
  </section>

  <section class="hloop"><div class="lpl" data-rev>
    <h2>A market that <i>settles itself.</i></h2>
    <p>The index prints, the oracle signs, the contract pays out of escrow.</p></div>
    <div class="loopbox" data-rev><svg viewBox="0 0 400 400" class="loopsvg"><circle cx="200" cy="200" r="150" fill="none" stroke="#2f6bff" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 9"/><circle class="orbit" r="9" fill="#2f6bff"><animateMotion dur="9s" repeatCount="indefinite" path="M200,50 a150,150 0 1,1 -0.1,0"/></circle></svg>
      <div class="lc">${char("H100_SXM")}</div>
      ${LOOP.map((t, i) => `<span class="ln l${i}">${t}</span>`).join("")}</div>
  </section>

  <section class="hassets"><div data-rev><h2>Chips today. <i>The whole AI stack next.</i></h2>
    <p>The same machinery prices anything rented by the hour with a transparent daily price. We add a market only when a public, settleable source exists.</p></div>
    <div class="agrid2" data-rev>${ASSETS.map(([t, s], i) => `<div class="achip ${s}" style="--i:${i}"><b>${t}</b><small>${s === "live" ? "Live" : "Researching"}</small></div>`).join("")}</div>
    <div class="cast" data-rev>${Object.keys(CAST).map((c) => `<figure>${char(c)}<figcaption>${CAST[c].name}</figcaption></figure>`).join("")}</div>
  </section>

  <section class="hend"><div data-rev><h2>Start with a bet. <i>End with a market.</i></h2>
    <div class="hcta c"><button class="lp" data-go="trade">Launch App <i>↗</i></button><button class="lp ghost" data-go="thesis">Read the thesis</button></div></div></section>
  </div>`;
}

export function bindHome(go) {
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.2 });
  document.querySelectorAll("[data-rev]").forEach((el) => io.observe(el));
  document.querySelectorAll(".hl .w").forEach((el) => el.classList.add("in"));
  const huge = document.getElementById("huge"), stack = document.getElementById("stack"), stn = document.getElementById("stn");
  const cards = [...document.querySelectorAll(".scard")];
  let raf = 0;
  const upd = () => {
    raf = 0;
    const vh = innerHeight;
    if (huge) { const r = huge.getBoundingClientRect(), p = Math.min(1, Math.max(0, 1 - (r.top + r.height / 2) / vh)); huge.style.setProperty("--p", p.toFixed(3)); }
    if (stack) {
      const r = stack.getBoundingClientRect(), total = r.height - vh;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
      const f = p * (cards.length - 1), cur = Math.round(f);
      cards.forEach((c, i) => {
        const d = f - i, e = d < 0 ? Math.min(1, -d) : 0; 
        const ty = d < 0 ? 108 * (1 - Math.pow(1 - e, 3)) * 1 : 0;
        c.style.transform = d < 0 ? `translateY(${(e * vh).toFixed(0)}px)` : `translateY(${(-d * 26).toFixed(1)}px) scale(${(1 - d * 0.05).toFixed(3)})`;
        c.style.filter = d > 0 ? `brightness(${Math.max(0.5, 1 - d * 0.18).toFixed(2)})` : "none";
        c.style.zIndex = String(10 + i);
        c.classList.toggle("act", i === cur);
      });
      if (stn) stn.textContent = String(cur + 1);
    }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
  if (!reduce) { addEventListener("scroll", onScroll, { passive: true }); upd(); } else { cards.forEach((c, i) => { c.style.transform = `translateY(${i * 12}px)`; c.style.zIndex = String(10 - i); }); }
  new MutationObserver(() => { if (!document.querySelector(".home")) removeEventListener("scroll", onScroll); }).observe(document.getElementById("desk"), { childList: true });
}

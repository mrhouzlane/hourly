// drifting pixel squares, Groq-style. Cells snap to a 13px grid; each hops on its own timer.
(() => {
  const C = 13, L = document.createElement("div"); L.id = "px"; document.body.prepend(L);
  // shapes cut from the logo crossbar: the hourglass (small, large) and loose grains
  const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
  const hg = [...row(0,0,4), ...row(1,1,3), [2,2], ...row(3,1,3), ...row(4,0,4)];
  const shapes = [[[0,0]],[[0,0]],hg,hg];
  const els = [];
  const place = (e) => {
    const w = innerWidth, h = innerHeight, narrow = w < 900, edge = narrow ? 2 : Math.floor(w * .11 / C);
    const cols = Math.floor(w / C), rows = Math.floor(h / C);
    const left = Math.random() < .5, cx = left ? Math.floor(Math.random() * edge) : cols - 1 - Math.floor(Math.random() * edge);
    const cy = Math.floor(Math.random() * (rows - 3)), sh = shapes[Math.floor(Math.random() * shapes.length)];
    e.style.left = cx * C + "px"; e.style.top = cy * C + "px";
    const c = sh.length > 1 ? 5 : 8;
    e.style.width = e.style.height = c + "px";
    e.style.boxShadow = sh.slice(1).map(([x, y]) => `${x * c}px ${y * c}px 0 #2350ff`).join(",") || "none";
  };
  const n = innerWidth < 900 ? 5 : 10;
  for (let i = 0; i < n; i++) {
    const e = document.createElement("i"); place(e); L.append(e); els.push(e);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) continue;
    const hop = () => { e.style.opacity = 0; setTimeout(() => { place(e); e.style.opacity = ""; }, 280); setTimeout(hop, 2500 + Math.random() * 5500); };
    setTimeout(hop, Math.random() * 6000);
  }
})();
